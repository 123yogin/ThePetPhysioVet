"""Tests for the SMS opt-out preference endpoint (US-NOTIF-07, SRS §3.7 AC-03).

Run with:  ./.venv/bin/python manage.py test appointments.test_notification_prefs

Covers the read/set surface (GET default opted-in, PUT/PATCH update_or_create,
IsVet, validation) AND — because the value of the surface is what it does to
delivery — the end-to-end effect on the central dispatcher: an opted-out owner
gets no SMS (DeliveryLog SKIPPED_OPTED_OUT) while the doctor's in-app row is
still created and FCM still fires; an opted-in owner gets a mock SMS; and
flipping the pref changes the outcome on the very next dispatch (AC-05).
"""

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import DeliveryLog, DeviceToken, Notification, NotificationPref
from .notifications import notify
from .tests import PASSWORD, make_doctor, make_pet

PHONE = "+919876543210"


@override_settings(NOTIFY_MOCK=True)
class NotificationPrefEndpointTests(TestCase):
    """The read/set surface itself."""

    def setUp(self):
        self.doctor = make_doctor("drpref", email="pref@vet.test")
        self.client = APIClient()
        self.client.force_authenticate(self.doctor)

    # --- GET ---------------------------------------------------------------
    def test_get_defaults_to_opted_in_when_no_row(self):
        resp = self.client.get("/api/v1/notification-prefs", {"owner_phone": PHONE})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data, {"owner_phone": PHONE, "sms_opt_out": False})
        # A GET must not create a row.
        self.assertFalse(NotificationPref.objects.filter(owner_phone=PHONE).exists())

    def test_get_reflects_existing_row(self):
        NotificationPref.objects.create(owner_phone=PHONE, sms_opt_out=True)
        resp = self.client.get("/api/v1/notification-prefs", {"owner_phone": PHONE})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["sms_opt_out"], True)

    def test_get_requires_owner_phone(self):
        resp = self.client.get("/api/v1/notification-prefs")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("owner_phone", resp.data)

    # --- PUT / PATCH -------------------------------------------------------
    def test_put_creates_row_opting_out(self):
        resp = self.client.put(
            "/api/v1/notification-prefs",
            {"owner_phone": PHONE, "sms_opt_out": True},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["owner_phone"], PHONE)
        self.assertEqual(resp.data["sms_opt_out"], True)
        pref = NotificationPref.objects.get(owner_phone=PHONE)
        self.assertTrue(pref.sms_opt_out)

    def test_put_updates_existing_row_in_place(self):
        NotificationPref.objects.create(owner_phone=PHONE, sms_opt_out=True)
        resp = self.client.put(
            "/api/v1/notification-prefs",
            {"owner_phone": PHONE, "sms_opt_out": False},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["sms_opt_out"], False)
        # update_or_create must not spawn a duplicate for the unique phone.
        self.assertEqual(NotificationPref.objects.filter(owner_phone=PHONE).count(), 1)

    def test_patch_behaves_like_put(self):
        resp = self.client.patch(
            "/api/v1/notification-prefs",
            {"owner_phone": PHONE, "sms_opt_out": True},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(NotificationPref.objects.get(owner_phone=PHONE).sms_opt_out)

    def test_post_behaves_like_put(self):
        # POST is the SPA client's save verb (useSetNotificationPref).
        resp = self.client.post(
            "/api/v1/notification-prefs",
            {"owner_phone": PHONE, "sms_opt_out": True},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["owner_phone"], PHONE)
        self.assertTrue(NotificationPref.objects.get(owner_phone=PHONE).sms_opt_out)

    def test_put_accepts_string_boolean(self):
        resp = self.client.put(
            "/api/v1/notification-prefs",
            {"owner_phone": PHONE, "sms_opt_out": "true"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(NotificationPref.objects.get(owner_phone=PHONE).sms_opt_out)

    def test_put_requires_owner_phone(self):
        resp = self.client.put(
            "/api/v1/notification-prefs", {"sms_opt_out": True}, format="json"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("owner_phone", resp.data)

    def test_put_rejects_missing_or_unparseable_flag(self):
        resp = self.client.put(
            "/api/v1/notification-prefs", {"owner_phone": PHONE}, format="json"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("sms_opt_out", resp.data)

        resp = self.client.put(
            "/api/v1/notification-prefs",
            {"owner_phone": PHONE, "sms_opt_out": "maybe"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("sms_opt_out", resp.data)

    # --- AuthZ -------------------------------------------------------------
    def test_requires_authenticated_vet(self):
        # Anonymous -> 401 (session auth, no credentials); matches the SPA's
        # RequireAuth 401 contract exercised across the existing API suite.
        anon = APIClient()
        self.assertEqual(
            anon.get("/api/v1/notification-prefs", {"owner_phone": PHONE}).status_code,
            401,
        )
        self.assertEqual(
            anon.put(
                "/api/v1/notification-prefs",
                {"owner_phone": PHONE, "sms_opt_out": True},
                format="json",
            ).status_code,
            401,
        )


@override_settings(NOTIFY_MOCK=True)
class OptOutEnforcementTests(TestCase):
    """Prove the set surface actually governs delivery through the dispatcher."""

    def setUp(self):
        self.doctor = make_doctor("drdisp", email="disp@vet.test")
        self.pet = make_pet(self.doctor, phone=PHONE)
        # Register a browser so FCM has a concrete recipient to target.
        DeviceToken.objects.create(user=self.doctor, token="tok-abc")
        self.client = APIClient()
        self.client.force_authenticate(self.doctor)

    def _fire(self, dedup_key):
        return notify(
            self.doctor,
            Notification.APPOINTMENT_CREATED,
            f"New appointment for {self.pet.name} ({self.pet.owner_name}).",
            dedup_key=dedup_key,
            sms_to=PHONE,
            push=True,
        )

    def test_opted_in_owner_gets_mock_sms(self):
        self._fire("ev-in-1")
        sms = DeliveryLog.objects.filter(channel=DeliveryLog.SMS, recipient=PHONE)
        self.assertEqual(sms.count(), 1)
        self.assertEqual(sms.first().status, DeliveryLog.MOCK)

    def test_opted_out_owner_no_sms_but_inapp_and_fcm_still_fire(self):
        self.client.put(
            "/api/v1/notification-prefs",
            {"owner_phone": PHONE, "sms_opt_out": True},
            format="json",
        )
        notif = self._fire("ev-out-1")

        # In-app Notification row still created.
        self.assertIsNotNone(notif)
        self.assertTrue(Notification.objects.filter(pk=notif.pk).exists())

        # SMS attempt audited as skipped — nothing "sent".
        sms = DeliveryLog.objects.get(channel=DeliveryLog.SMS, recipient=PHONE)
        self.assertEqual(sms.status, DeliveryLog.SKIPPED_OPTED_OUT)

        # FCM to the doctor still fires (opt-out is SMS-only).
        fcm = DeliveryLog.objects.filter(channel=DeliveryLog.FCM, notification=notif)
        self.assertEqual(fcm.count(), 1)
        self.assertEqual(fcm.first().status, DeliveryLog.MOCK)

    def test_pref_change_takes_effect_on_next_dispatch(self):
        # AC-05: opted-in first -> SMS sent (mock).
        self._fire("ev-1")
        first = DeliveryLog.objects.get(channel=DeliveryLog.SMS, recipient=PHONE)
        self.assertEqual(first.status, DeliveryLog.MOCK)

        # Owner opts out via the endpoint.
        self.client.put(
            "/api/v1/notification-prefs",
            {"owner_phone": PHONE, "sms_opt_out": True},
            format="json",
        )

        # Next distinct event -> the new pref is honoured (skipped).
        self._fire("ev-2")
        second = (
            DeliveryLog.objects.filter(channel=DeliveryLog.SMS, recipient=PHONE)
            .exclude(pk=first.pk)
            .get()
        )
        self.assertEqual(second.status, DeliveryLog.SKIPPED_OPTED_OUT)

        # And opting back in restores delivery on the following dispatch.
        self.client.put(
            "/api/v1/notification-prefs",
            {"owner_phone": PHONE, "sms_opt_out": False},
            format="json",
        )
        self._fire("ev-3")
        third = (
            DeliveryLog.objects.filter(channel=DeliveryLog.SMS, recipient=PHONE)
            .exclude(pk__in=[first.pk, second.pk])
            .get()
        )
        self.assertEqual(third.status, DeliveryLog.MOCK)
