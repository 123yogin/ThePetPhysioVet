"""Tests for US-NOTIF-06b — FCM web-push adapter + device-token registration.

Run with:  ./.venv/bin/python manage.py test appointments.test_delivery_fcm

Covers (SRS §3.7, §7):
  * ``FcmProvider`` fail-safes to the dev mock when no service-account creds are
    configured — a MOCK DeliveryResult, zero external calls, never raises.
  * An event notification AND a REMINDER notification each produce a DeliveryLog
    row (channel=FCM, status=MOCK) targeting the doctor's registered token, with
    the concrete ``FcmProvider`` resolved (NOTIFY_MOCK off) and no network call.
  * ``POST /api/v1/devices`` registration is idempotent and cross-user isolated.
"""

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .delivery.fcm import FcmProvider
from .delivery.base import DeliveryResult
from .models import DeliveryLog, DeviceToken, Notification
from .notifications import notify
from .tests import PASSWORD, make_doctor

_FCM_PATH = "appointments.delivery.fcm.FcmProvider"


# ---------------------------------------------------------------------------
# FcmProvider unit behaviour
# ---------------------------------------------------------------------------
class FcmProviderUnitTests(TestCase):
    def test_fail_safe_to_mock_when_no_creds(self):
        """No service account -> MOCK result, delegated to the dev mock."""
        provider = FcmProvider()
        self.assertFalse(provider.is_configured)
        result = provider.send("fcm-token-abc", "hi doctor", None)
        self.assertIsInstance(result, DeliveryResult)
        self.assertEqual(result.status, DeliveryLog.MOCK)
        self.assertIn("fcm-token-abc", result.detail)

    @override_settings(FCM_PROJECT_ID="proj", FCM_SERVER_KEY="key")
    def test_real_send_never_raises_and_makes_no_external_call(self):
        """Creds present but firebase-admin absent -> graceful FAILED, no raise."""
        provider = FcmProvider()
        self.assertTrue(provider.is_configured)
        # firebase-admin is not installed in dev/CI, so the deferred import
        # fails -> the error is caught and reported, never propagated.
        result = provider.send("fcm-token-xyz", "hi", None)
        self.assertEqual(result.status, DeliveryLog.FAILED)
        self.assertIn("fcm error", result.detail)


# ---------------------------------------------------------------------------
# End-to-end dispatch with the concrete FcmProvider resolved
# ---------------------------------------------------------------------------
@override_settings(NOTIFY_MOCK=False, NOTIFY_FCM_PROVIDER=_FCM_PATH)
class FcmDispatchTests(TestCase):
    def setUp(self):
        self.doc = make_doctor("drfcm")
        self.token = DeviceToken.objects.create(
            user=self.doc, token="doc-browser-token", platform="web"
        )

    def _assert_fcm_mock_to_token(self):
        logs = DeliveryLog.objects.filter(channel=DeliveryLog.FCM)
        self.assertEqual(logs.count(), 1)
        log = logs.first()
        self.assertEqual(log.status, DeliveryLog.MOCK)
        self.assertEqual(log.recipient, "doc-browser-token")
        return log

    def test_event_notification_logs_fcm_mock_to_doctor_token(self):
        notif = notify(
            self.doc,
            Notification.APPOINTMENT_CREATED,
            "New appointment for Bruno",
            dedup_key="evt-1",
        )
        self.assertIsNotNone(notif)
        log = self._assert_fcm_mock_to_token()
        self.assertEqual(log.notif_type, Notification.APPOINTMENT_CREATED)

    def test_reminder_notification_logs_fcm_mock_to_doctor_token(self):
        notif = notify(
            self.doc,
            Notification.REMINDER,
            "Reminder: Bruno in 1h",
            dedup_key="rem-1",
        )
        self.assertIsNotNone(notif)
        log = self._assert_fcm_mock_to_token()
        self.assertEqual(log.notif_type, Notification.REMINDER)

    def test_idempotent_dedup_key_delivers_once(self):
        notify(self.doc, Notification.REMINDER, "Reminder", dedup_key="rem-dup")
        notify(self.doc, Notification.REMINDER, "Reminder", dedup_key="rem-dup")
        self.assertEqual(
            DeliveryLog.objects.filter(channel=DeliveryLog.FCM).count(), 1
        )


# ---------------------------------------------------------------------------
# Device-token registration endpoint
# ---------------------------------------------------------------------------
class DeviceTokenRegisterTests(TestCase):
    URL = "/api/v1/devices"

    def setUp(self):
        self.doc = make_doctor("drdev")
        self.client = APIClient()
        self.client.login(username="drdev", password=PASSWORD)

    def test_register_creates_token_scoped_to_caller(self):
        resp = self.client.post(self.URL, {"token": "tok-1"}, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.data["created"])
        dt = DeviceToken.objects.get(token="tok-1")
        self.assertEqual(dt.user, self.doc)
        self.assertEqual(dt.platform, "web")

    def test_register_is_idempotent(self):
        r1 = self.client.post(self.URL, {"token": "tok-1"}, format="json")
        r2 = self.client.post(self.URL, {"token": "tok-1"}, format="json")
        self.assertEqual(r1.status_code, 201)
        self.assertEqual(r2.status_code, 200)
        self.assertFalse(r2.data["created"])
        self.assertEqual(DeviceToken.objects.filter(token="tok-1").count(), 1)

    def test_register_requires_token(self):
        resp = self.client.post(self.URL, {}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("token", resp.data)

    def test_register_requires_authenticated_vet(self):
        anon = APIClient()
        resp = anon.post(self.URL, {"token": "tok-x"}, format="json")
        self.assertIn(resp.status_code, (401, 403))
        self.assertFalse(DeviceToken.objects.filter(token="tok-x").exists())

    def test_register_is_cross_user_isolated(self):
        other = make_doctor("drother")
        oc = APIClient()
        oc.login(username="drother", password=PASSWORD)

        self.client.post(self.URL, {"token": "tok-a"}, format="json")
        oc.post(self.URL, {"token": "tok-b"}, format="json")

        self.assertEqual(
            set(self.doc.device_tokens.values_list("token", flat=True)), {"tok-a"}
        )
        self.assertEqual(
            set(other.device_tokens.values_list("token", flat=True)), {"tok-b"}
        )

    def test_delete_unregisters_only_callers_token(self):
        other = make_doctor("drown")
        DeviceToken.objects.create(user=other, token="tok-other")
        self.client.post(self.URL, {"token": "tok-mine"}, format="json")

        # Cannot delete another doctor's token.
        self.client.delete(self.URL, {"token": "tok-other"}, format="json")
        self.assertTrue(DeviceToken.objects.filter(token="tok-other").exists())

        # Can delete own token.
        resp = self.client.delete(self.URL, {"token": "tok-mine"}, format="json")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(DeviceToken.objects.filter(token="tok-mine").exists())
