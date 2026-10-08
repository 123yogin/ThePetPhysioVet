"""Transactional SMS through the Android gateway (appointments/sms/).

The gateway is capcom6 "SMS Gateway for Android" in Cloud mode. Its API was
read from the Cloud server's own Swagger (https://api.sms-gate.app/docs/doc.json,
fetched 2026-10-08), not guessed:

    POST {SMS_GATEWAY_URL}/messages            (HTTP Basic auth)
    {"id": "...<=36", "textMessage": {"text": "..."}, "phoneNumbers": ["+91..."], ...}
    -> 202 {"id": "...", "state": "Pending", "recipients": [...], "deviceId": "..."}
    -> 409 when a message with the same `id` already exists

Webhooks are HMAC-SHA256 signed: X-Signature = hex(HMAC(key, raw_body + X-Timestamp)).

No test reaches the network: `urlopen` inside the backend module is patched,
and the default backend under DEBUG is the console one.

Traceability: PRODUCT_PLAN integrations (SMS); CLAUDE.md rules 1, 4, 6, 7.
"""
import base64
import hashlib
import hmac
import io
import json
import time as time_mod
from datetime import date, time, timedelta
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, override_settings
from django.utils import timezone

from appointments.models import (
    Appointment, BoardingBooking, Enquiry, NotificationPref, SmsMessage, UserProfile,
)
from appointments.sms import mask_phone, send_sms, to_e164
from .base import API, ApiTestCase

URLOPEN = "appointments.sms.backends.urlopen"
GATEWAY = dict(
    SMS_BACKEND="android_gateway",
    SMS_GATEWAY_URL="https://gw.test/3rdparty/v1",
    SMS_GATEWAY_USERNAME="gwuser",
    SMS_GATEWAY_PASSWORD="gw-secret-pass",
)
CRON = f"{API}/cron/sms-reminders"
WEBHOOK = f"{API}/sms/webhook"
SIGNING_KEY = "whsec-test-key"


class FakeResponse:
    def __init__(self, status=202, body=None):
        self.status = status
        self._body = json.dumps({} if body is None else body).encode()

    def read(self, *a):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def accepted(req, timeout=None):
    """What the Cloud API answers for a valid enqueue (202 + MessageState)."""
    payload = json.loads(req.data)
    return FakeResponse(202, {
        "id": payload["id"], "deviceId": "d" * 21, "state": "Pending",
        "recipients": [{"phoneNumber": payload["phoneNumbers"][0], "state": "Pending"}],
    })


def http_error(code, body=b'{"message":"nope"}'):
    return HTTPError("https://gw.test/3rdparty/v1/messages", code, "err", {}, io.BytesIO(body))


def _sent(n, when=None, **kw):
    when = when or timezone.now()
    for i in range(n):
        SmsMessage.objects.create(
            to="+919000000000", body="x", kind="test", status="SENT",
            idempotency_key=f"seed:{when.isoformat()}:{i}:{kw.get('tag', '')}", sent_at=when,
        )


# ------------------------------------------------------------------ helpers --
class PhoneFormatTests(SimpleTestCase):
    def test_indian_numbers_fold_to_e164(self):
        for raw in ("98765 43210", "+91 98765-43210", "09876543210", "919876543210", "+919876543210"):
            with self.subTest(raw=raw):
                self.assertEqual(to_e164(raw), "+919876543210")

    @override_settings(SMS_ALLOWED_COUNTRY_CODES=("+91", "+44"))
    def test_international_number_with_plus_is_kept_when_allowed(self):
        self.assertEqual(to_e164("+44 7700 900123"), "+447700900123")

    def test_unusable_numbers_are_none(self):
        for raw in ("", None, "12345", "98ab543210", "4477009001234"):
            with self.subTest(raw=raw):
                self.assertIsNone(to_e164(raw))

    def test_mask_keeps_only_last_four(self):
        self.assertEqual(mask_phone("+919876543210"), "*********3210")
        self.assertEqual(mask_phone("123"), "****")
        self.assertEqual(mask_phone(""), "")


class SmsSettingsTests(SimpleTestCase):
    def test_backend_choice(self):
        from petphysio.settings import _sms_backend_choice as choose
        creds = {"SMS_GATEWAY_USERNAME": "u", "SMS_GATEWAY_PASSWORD": "p"}
        self.assertEqual(choose({}, debug=True), "console")
        self.assertEqual(choose({}, debug=False), "disabled")
        self.assertEqual(choose({**creds, "VERCEL_ENV": "production"}, debug=False), "android_gateway")
        self.assertEqual(choose({"SMS_BACKEND": "disabled", **creds}, debug=False), "disabled")
        with self.assertRaises(ImproperlyConfigured):
            choose({"SMS_BACKEND": "android_gateway"}, debug=False)
        with self.assertRaises(ImproperlyConfigured):
            choose({"SMS_BACKEND": "carrier-pigeon"}, debug=True)

    def test_daily_limit(self):
        from petphysio.settings import _sms_daily_limit as limit
        self.assertEqual(limit({}), 90)
        self.assertEqual(limit({"SMS_DAILY_LIMIT": "40"}), 40)
        for bad in ("0", "-1", "lots"):
            with self.subTest(bad=bad), self.assertRaises(ImproperlyConfigured):
                limit({"SMS_DAILY_LIMIT": bad})

    def test_gateway_url_must_be_https(self):
        from petphysio.settings import _sms_gateway_url as url
        self.assertEqual(url({}), "https://api.sms-gate.app/3rdparty/v1")
        self.assertEqual(url({"SMS_GATEWAY_URL": "https://x.test/3rdparty/v1/"}), "https://x.test/3rdparty/v1")
        with self.assertRaises(ImproperlyConfigured):
            url({"SMS_GATEWAY_URL": "http://x.test/3rdparty/v1"})


# ------------------------------------------------------------------ send_sms --
@override_settings(**GATEWAY, SMS_DAILY_LIMIT=90)
class SendSmsGatewayTests(ApiTestCase):
    def test_posts_the_documented_capcom6_shape(self):
        with patch(URLOPEN, side_effect=accepted) as op:
            msg = send_sms("98765 43210", "Hello", kind="test")
        self.assertEqual(op.call_count, 1)
        req = op.call_args.args[0]
        self.assertEqual(req.full_url, "https://gw.test/3rdparty/v1/messages")
        self.assertEqual(req.get_method(), "POST")
        body = json.loads(req.data)
        self.assertEqual(body["textMessage"], {"text": "Hello"})
        self.assertEqual(body["phoneNumbers"], ["+919876543210"])
        self.assertEqual(body["id"], str(msg.id))
        self.assertLessEqual(len(body["id"]), 36)
        expected = "Basic " + base64.b64encode(b"gwuser:gw-secret-pass").decode()
        self.assertEqual(req.get_header("Authorization"), expected)
        self.assertEqual(req.get_header("Content-type"), "application/json")
        self.assertEqual(op.call_args.kwargs.get("timeout"), 5)
        msg.refresh_from_db()
        self.assertEqual(msg.status, "SENT")
        self.assertEqual(msg.provider_id, str(msg.id))
        self.assertEqual(msg.to, "+919876543210")
        self.assertIsNotNone(msg.sent_at)

    def test_timeout_is_failed_and_never_raises(self):
        # (exception, may it have reached the gateway?) -- "maybe" keeps sent_at
        # so the send still uses a daily-cap slot (security review M3).
        cases = ((TimeoutError("timed out"), True), (URLError("unreachable"), False), (OSError("reset"), True))
        for exc, maybe_sent in cases:
            with self.subTest(exc=type(exc).__name__), patch(URLOPEN, side_effect=exc):
                msg = send_sms("9876543210", "Hello", kind="test")
            self.assertEqual(msg.status, "FAILED")
            self.assertTrue(msg.error)
            self.assertEqual(msg.sent_at is not None, maybe_sent)

    def test_rejected_credentials_never_leak_into_error_or_logs(self):
        with self.assertLogs("appointments.sms", "INFO") as logs, \
                patch(URLOPEN, side_effect=http_error(401, b'{"message":"Unauthorized"}')):
            msg = send_sms("9876543210", "Hello", kind="test")
        self.assertEqual(msg.status, "FAILED")
        self.assertIn("401", msg.error)
        everything = msg.error + "\n".join(logs.output)
        for secret in ("gw-secret-pass", base64.b64encode(b"gwuser:gw-secret-pass").decode(), "9876543210"):
            self.assertNotIn(secret, everything)

    def test_gateway_409_means_this_id_was_already_enqueued(self):
        with patch(URLOPEN, side_effect=http_error(409)):
            msg = send_sms("9876543210", "Hello", kind="test")
        self.assertEqual(msg.status, "SENT")
        self.assertEqual(msg.provider_id, str(msg.id))

    def test_unexpected_gateway_body_is_failed(self):
        with patch(URLOPEN, return_value=FakeResponse(202, {"surprise": True})):
            msg = send_sms("9876543210", "Hello", kind="test")
        self.assertEqual(msg.status, "FAILED")
        self.assertIn("response", msg.error.lower())

    def test_503_device_offline_is_failed(self):
        with patch(URLOPEN, side_effect=http_error(503)):
            msg = send_sms("9876543210", "Hello", kind="test")
        self.assertEqual(msg.status, "FAILED")
        self.assertIn("503", msg.error)

    def test_opted_out_owner_is_skipped_without_calling_gateway(self):
        NotificationPref.objects.create(owner_phone="9876543210", sms_opt_out=True)
        with patch(URLOPEN) as op:
            msg = send_sms("+91 98765 43210", "Hello", kind="test")
        op.assert_not_called()
        self.assertEqual(msg.status, "SKIPPED_OPTOUT")

    def test_opt_out_matches_whatever_form_the_pref_was_stored_in(self):
        NotificationPref.objects.create(owner_phone="+919876543210", sms_opt_out=True)
        with patch(URLOPEN) as op:
            msg = send_sms("98765 43210", "Hello", kind="test")
        op.assert_not_called()
        self.assertEqual(msg.status, "SKIPPED_OPTOUT")

    @override_settings(SMS_DAILY_LIMIT=2)
    def test_daily_cap_counts_only_todays_sent(self):
        _sent(2, when=timezone.now() - timedelta(days=1), tag="y")
        with patch(URLOPEN, side_effect=accepted):
            first = send_sms("9876543210", "a", kind="test")
            second = send_sms("9876543211", "b", kind="test")
        self.assertEqual([first.status, second.status], ["SENT", "SENT"])
        with patch(URLOPEN) as op:
            third = send_sms("9876543212", "c", kind="test")
        op.assert_not_called()
        self.assertEqual(third.status, "SKIPPED_LIMIT")

    def test_same_kind_object_and_date_is_sent_once(self):
        with patch(URLOPEN, side_effect=accepted) as op:
            a = send_sms("9991110001", "hi", kind="appointment_reminder",
                         related=self.appt_a, scheduled_for="2030-01-03")
            b = send_sms("9991110001", "hi", kind="appointment_reminder",
                         related=self.appt_a, scheduled_for="2030-01-03")
        self.assertEqual(op.call_count, 1)
        self.assertEqual(a.id, b.id)
        self.assertEqual(SmsMessage.objects.filter(kind="appointment_reminder").count(), 1)
        self.assertEqual(a.appointment_id, self.appt_a.id)

    def test_a_failed_send_is_retried_with_the_same_gateway_id(self):
        kw = dict(kind="appointment_reminder", related=self.appt_a, scheduled_for="2030-01-03")
        with patch(URLOPEN, side_effect=URLError("down")):
            first = send_sms("9991110001", "hi", **kw)
        self.assertEqual(first.status, "FAILED")
        with patch(URLOPEN, side_effect=accepted) as op:
            again = send_sms("9991110001", "hi", **kw)
        self.assertEqual(again.id, first.id)
        self.assertEqual(again.status, "SENT")
        self.assertEqual(json.loads(op.call_args.args[0].data)["id"], str(first.id))
        self.assertEqual(again.error, "")

    def test_invalid_number_is_failed_without_calling_gateway(self):
        with patch(URLOPEN) as op:
            msg = send_sms("12ab", "Hello", kind="test")
        op.assert_not_called()
        self.assertEqual(msg.status, "FAILED")

    def test_long_or_unicode_body_warns(self):
        with self.assertLogs("appointments.sms", "WARNING") as logs, patch(URLOPEN, side_effect=accepted):
            send_sms("9876543210", "x" * 161, kind="test")
        self.assertTrue(any("160" in line for line in logs.output))

    def test_database_failure_never_raises(self):
        with patch("appointments.sms.service.SmsMessage.objects.create", side_effect=RuntimeError("db")):
            msg = send_sms("9876543210", "Hello", kind="test")
        self.assertEqual(msg.status, "FAILED")


class SmsModeTests(ApiTestCase):
    @override_settings(SMS_BACKEND="disabled")
    def test_disabled_records_skipped(self):
        with patch(URLOPEN) as op:
            msg = send_sms("9876543210", "Hello", kind="test")
        op.assert_not_called()
        self.assertEqual(msg.status, "SKIPPED_DISABLED")

    @override_settings(SMS_BACKEND="console")
    def test_console_logs_and_marks_sent(self):
        with patch(URLOPEN) as op, self.assertLogs("appointments.sms", "INFO") as logs:
            msg = send_sms("9876543210", "Hello", kind="test")
        op.assert_not_called()
        self.assertEqual(msg.status, "SENT")
        self.assertEqual(msg.provider, "console")
        self.assertNotIn("9876543210", "\n".join(logs.output))


# ------------------------------------------------------------------ triggers --
@override_settings(SMS_BACKEND="console", CLINIC_NAME="Pet Physio Vet", CLINIC_PHONE="+91 72840 73241")
class TriggerTests(ApiTestCase):
    def test_doctor_confirm_texts_the_owner(self):
        appt = Appointment.objects.create(
            pet=self.pet_a, doctor=self.doctor, pet_name="Rex", owner_name="Alice Aye",
            owner_phone="9991110001", date=date(2030, 1, 3), time=time(11, 0), status="Pending",
        )
        r = self.auth(self.doctor).post(f"{API}/appointments/{appt.id}/confirm")
        self.assertEqual(r.status_code, 200, r.content)
        msg = SmsMessage.objects.get(kind="appointment_confirmed", appointment=appt)
        self.assertEqual(msg.to, "+919991110001")
        self.assertEqual(
            msg.body,
            "Pet Physio Vet: Rex's appointment is confirmed for Thu 3 Jan, 11:00 AM. "
            "Call +91 72840 73241 to change.",
        )
        self.assertEqual(msg.status, "SENT")

    def test_an_sms_failure_never_breaks_the_confirm(self):
        appt = Appointment.objects.create(
            pet=self.pet_a, doctor=self.doctor, pet_name="Rex", owner_name="Alice Aye",
            owner_phone="9991110001", date=date(2030, 1, 3), time=time(11, 0), status="Pending",
        )
        with patch("appointments.sms.triggers.send_sms", side_effect=RuntimeError("boom")):
            r = self.auth(self.doctor).post(f"{API}/appointments/{appt.id}/confirm")
        self.assertEqual(r.status_code, 200, r.content)
        appt.refresh_from_db()
        self.assertEqual(appt.status, "Confirmed")

    def test_enquiry_confirm_and_book_texts_the_owner(self):
        enq = Enquiry.objects.create(
            first_name="New", last_name="Owner", pet_name="Bruno", species_breed="Lab",
            email="new@example.com", phone="9001112222", reason="stiff",
        )
        when = timezone.localdate() + timedelta(days=5)
        r = self.auth(self.doctor).post(
            f"{API}/enquiries/{enq.id}/convert",
            {"date": when.isoformat(), "time": "09:30", "visit_type": "Hydrotherapy"}, format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        msg = SmsMessage.objects.get(kind="appointment_confirmed")
        self.assertEqual(msg.to, "+919001112222")
        self.assertIn("Bruno's appointment is confirmed", msg.body)
        self.assertIn("9:30 AM", msg.body)
        # Converting again is idempotent and must not text twice.
        self.client.post(f"{API}/enquiries/{enq.id}/convert",
                         {"date": when.isoformat(), "time": "09:30", "visit_type": "Hydrotherapy"},
                         format="json")
        self.assertEqual(SmsMessage.objects.filter(kind="appointment_confirmed").count(), 1)

    def _stay(self, **kw):
        defaults = dict(
            reference="BRD-ABC123", pet_name="Bruno", owner_name="Priya", owner_phone="98765 43210",
            check_in=date(2030, 1, 3), duration="48h", status="PENDING", terms_accepted=True,
        )
        defaults.update(kw)
        return BoardingBooking.objects.create(**defaults)

    def test_boarding_confirm_texts_the_owner_once(self):
        stay = self._stay()
        c = self.auth(self.doctor)
        for _ in range(2):
            r = c.post(f"{API}/facility/boarding/{stay.reference}/status", {"action": "confirm"}, format="json")
            self.assertEqual(r.status_code, 200, r.content)
        msgs = SmsMessage.objects.filter(kind="boarding_confirmed", boarding=stay)
        self.assertEqual(msgs.count(), 1)
        self.assertIn("BRD-ABC123", msgs[0].body)
        self.assertIn("Thu 3 Jan", msgs[0].body)
        self.assertEqual(msgs[0].to, "+919876543210")

    def test_doctor_created_stay_is_confirmed_by_sms_public_request_is_not(self):
        body = {
            "petName": "Bruno", "ownerName": "Priya Shah", "ownerPhone": "98765 43210",
            "checkIn": (timezone.localdate() + timedelta(days=3)).isoformat(), "duration": "24h",
            "termsAccepted": True, "emergencyContactName": "Raj", "emergencyContactPhone": "9811122233",
        }
        r = self.anon().post(f"{API}/facility/boarding", body, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertFalse(SmsMessage.objects.exists())
        r = self.auth(self.doctor).post(f"{API}/facility/boarding", body, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(SmsMessage.objects.filter(kind="boarding_confirmed").count(), 1)

    def test_other_boarding_actions_do_not_text(self):
        stay = self._stay(status="CONFIRMED", check_in=timezone.localdate())
        self.auth(self.doctor).post(f"{API}/facility/boarding/{stay.reference}/status",
                                    {"action": "check_in"}, format="json")
        self.assertFalse(SmsMessage.objects.exists())

    def test_every_template_fits_one_gsm_segment(self):
        from appointments.sms import templates
        from appointments.sms.service import gsm_length
        long_pet = "Sir Barkington Woofles III"
        d, t = date(2030, 12, 31), time(23, 59)
        for body in (
            templates.appointment_confirmed(long_pet, d, t),
            templates.appointment_reminder(long_pet, d, t),
            templates.boarding_confirmed(long_pet, d, d + timedelta(days=30), "BRD-ABCDEF"),
            templates.boarding_checkout(long_pet, d),
            templates.test_message(),
        ):
            with self.subTest(body=body):
                self.assertIsNotNone(gsm_length(body))
                self.assertLessEqual(gsm_length(body), 160)


# ---------------------------------------------------------------------- cron --
@override_settings(SMS_BACKEND="console", CRON_SECRET="cron-secret-123456")
class CronTests(ApiTestCase):
    def _appt(self, day, status="Confirmed", hhmm=(10, 0), pet=None):
        pet = pet or self.pet_a
        return Appointment.objects.create(
            pet=pet, doctor=self.doctor, pet_name=pet.name, owner_name=pet.owner_name,
            owner_phone=pet.owner_phone, date=day, time=time(*hhmm), status=status,
            confirmed_at=timezone.now(), confirmed_by=self.doctor,
        )

    def _cron(self, token="cron-secret-123456"):
        self.anon()
        headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"} if token is not None else {}
        return self.client.get(CRON, **headers)

    def test_requires_the_cron_secret(self):
        for token in (None, "", "wrong", "cron-secret-12345", "cron-secret-1234567"):
            with self.subTest(token=token):
                self.assertEqual(self._cron(token).status_code, 401)
        self.assertFalse(SmsMessage.objects.exists())

    @override_settings(CRON_SECRET="")
    def test_unset_secret_rejects_everything(self):
        self.assertEqual(self._cron("").status_code, 401)
        self.assertEqual(self._cron("anything").status_code, 401)

    def test_a_user_jwt_is_not_a_cron_secret(self):
        self.auth(self.doctor)
        self.assertEqual(self.client.get(CRON).status_code, 401)

    def test_only_get(self):
        self.anon()
        r = self.client.post(CRON, HTTP_AUTHORIZATION="Bearer cron-secret-123456")
        self.assertEqual(r.status_code, 405)

    def test_reminds_tomorrows_confirmed_appointments_once(self):
        tomorrow = timezone.localdate() + timedelta(days=1)
        due = self._appt(tomorrow)
        moved = self._appt(tomorrow, status="Rescheduled", hhmm=(12, 0))
        self._appt(tomorrow, status="Pending", hhmm=(13, 0))
        self._appt(tomorrow, status="Cancelled", hhmm=(14, 0))
        self._appt(timezone.localdate() + timedelta(days=2), hhmm=(15, 0))

        r = self._cron()
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["appointment_reminders"]["sent"], 2)
        msgs = SmsMessage.objects.filter(kind="appointment_reminder")
        self.assertEqual({m.appointment_id for m in msgs}, {due.id, moved.id})
        self.assertIn("tomorrow", msgs.get(appointment=due).body)

        again = self._cron()
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.data["appointment_reminders"]["sent"], 0)
        self.assertEqual(again.data["appointment_reminders"]["already_sent"], 2)
        self.assertEqual(SmsMessage.objects.filter(kind="appointment_reminder").count(), 2)

    def test_checkout_reminder_on_the_day_an_overnight_stay_leaves(self):
        today = timezone.localdate()
        leaving = BoardingBooking.objects.create(
            reference="BRD-LEAVE1", pet_name="Bruno", owner_name="Priya", owner_phone="9876543210",
            check_in=today - timedelta(days=1), duration="24h", status="CHECKED_IN",
        )
        # Sub-day stays arrive and leave the same day: no 9am "ends today" text.
        BoardingBooking.objects.create(
            reference="BRD-SHORT1", pet_name="Tiny", owner_name="Ravi", owner_phone="9876543211",
            check_in=today, duration="8h", status="CONFIRMED",
        )
        BoardingBooking.objects.create(
            reference="BRD-GONE01", pet_name="Gone", owner_name="Ravi", owner_phone="9876543212",
            check_in=today - timedelta(days=1), duration="24h", status="CANCELLED",
        )
        r = self._cron()
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["checkout_reminders"]["sent"], 1)
        msg = SmsMessage.objects.get(kind="boarding_checkout")
        self.assertEqual(msg.boarding_id, leaving.id)
        self.assertIn("Bruno", msg.body)

    @override_settings(**GATEWAY, SMS_PER_PHONE_DAILY_LIMIT=10)  # five visits, one owner
    def test_a_dead_gateway_stops_the_run_and_a_rerun_retries(self):
        tomorrow = timezone.localdate() + timedelta(days=1)
        for h in range(9, 14):
            self._appt(tomorrow, hhmm=(h, 0))
        with patch(URLOPEN, side_effect=URLError("down")) as op:
            r = self._cron()
        self.assertEqual(op.call_count, 3)  # circuit breaker
        self.assertEqual(r.data["appointment_reminders"]["failed"], 3)
        self.assertEqual(r.data["appointment_reminders"]["deferred"], 2)
        with patch(URLOPEN, side_effect=accepted):
            r = self._cron()
        self.assertEqual(r.data["appointment_reminders"]["sent"], 5)
        self.assertEqual(SmsMessage.objects.filter(kind="appointment_reminder").count(), 5)

    def test_opted_out_owner_is_counted_not_texted(self):
        NotificationPref.objects.create(owner_phone="9991110001", sms_opt_out=True)
        self._appt(timezone.localdate() + timedelta(days=1))
        r = self._cron()
        self.assertEqual(r.data["appointment_reminders"]["skipped"], 1)
        self.assertEqual(r.data["appointment_reminders"]["sent"], 0)


# ------------------------------------------------------------------- webhook --
@override_settings(SMS_WEBHOOK_SIGNING_KEY=SIGNING_KEY)
class WebhookTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.msg = SmsMessage.objects.create(
            to="+919876543210", body="x", kind="test", status="SENT", provider="android_gateway",
            provider_id="gw-msg-1", idempotency_key="test:webhook", sent_at=timezone.now(),
        )

    def _post(self, event, payload, key=SIGNING_KEY, ts=None, sig=None):
        raw = json.dumps({
            "deviceId": "d" * 21, "event": event, "id": "evt-1", "webhookId": "wh-1", "payload": payload,
        }).encode()
        ts = str(int(time_mod.time())) if ts is None else ts
        if sig is None:
            sig = hmac.new(key.encode(), raw + ts.encode(), hashlib.sha256).hexdigest()
        self.anon()
        return self.client.generic("POST", WEBHOOK, raw, content_type="application/json",
                                   HTTP_X_SIGNATURE=sig, HTTP_X_TIMESTAMP=ts)

    def test_delivered_updates_status(self):
        r = self._post("sms:delivered", {"messageId": "gw-msg-1", "deliveredAt": "2026-10-08T10:00:00.000+05:30"})
        self.assertEqual(r.status_code, 200, r.content)
        self.msg.refresh_from_db()
        self.assertEqual(self.msg.status, "DELIVERED")

    def test_failed_records_the_reason(self):
        r = self._post("sms:failed", {"messageId": "gw-msg-1", "reason": "RESULT_ERROR_NO_SERVICE"})
        self.assertEqual(r.status_code, 200, r.content)
        self.msg.refresh_from_db()
        self.assertEqual(self.msg.status, "FAILED")
        self.assertIn("NO_SERVICE", self.msg.error)

    def test_late_sent_event_does_not_downgrade_delivered(self):
        self._post("sms:delivered", {"messageId": "gw-msg-1"})
        self._post("sms:sent", {"messageId": "gw-msg-1"})
        self.msg.refresh_from_db()
        self.assertEqual(self.msg.status, "DELIVERED")

    def test_bad_signature_missing_headers_and_stale_timestamp_are_401(self):
        stale = str(int(time_mod.time()) - 600)
        for kwargs in ({"key": "wrong-key"}, {"sig": ""}, {"ts": ""}, {"ts": stale}, {"ts": "abc"}):
            with self.subTest(**kwargs):
                r = self._post("sms:failed", {"messageId": "gw-msg-1", "reason": "x"}, **kwargs)
                self.assertEqual(r.status_code, 401)
        self.msg.refresh_from_db()
        self.assertEqual(self.msg.status, "SENT")

    def test_unknown_message_is_acknowledged_and_ignored(self):
        r = self._post("sms:delivered", {"messageId": "someone-else"})
        self.assertEqual(r.status_code, 200)

    def test_malformed_signed_body_is_400(self):
        r = self._post("sms:delivered", {"noMessageId": True})
        self.assertEqual(r.status_code, 400)

    @override_settings(SMS_WEBHOOK_SIGNING_KEY="")
    def test_off_unless_a_signing_key_is_configured(self):
        r = self._post("sms:delivered", {"messageId": "gw-msg-1"}, key="anything")
        self.assertEqual(r.status_code, 404)


# ---------------------------------------------------------- doctor endpoints --
@override_settings(SMS_BACKEND="console", SMS_DAILY_LIMIT=90)
class SmsDoctorApiTests(ApiTestCase):
    LOG = f"{API}/sms/log"
    TEST = f"{API}/sms/test"

    def test_log_and_test_are_doctor_only(self):
        self.anon()
        self.assertEqual(self.client.get(self.LOG).status_code, 401)
        self.assertEqual(self.client.post(self.TEST, {"to": "9876543210"}, format="json").status_code, 401)
        self.auth(self.owner_a)
        self.assertEqual(self.client.get(self.LOG).status_code, 403)
        self.assertEqual(self.client.post(self.TEST, {"to": "9876543210"}, format="json").status_code, 403)
        self.assertFalse(SmsMessage.objects.exists())

    def test_log_masks_phones_and_reports_mode_and_cap(self):
        send_sms("9876543210", "Hello", kind="appointment_confirmed", related=self.appt_a, scheduled_for="x")
        r = self.auth(self.doctor).get(self.LOG)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["mode"], "console")
        self.assertEqual(r.data["daily_limit"], 90)
        self.assertEqual(r.data["sent_today"], 1)
        self.assertEqual(r.data["count"], 1)
        row = r.data["results"][0]
        self.assertEqual(row["to"], "*********3210")
        self.assertEqual(row["kind"], "appointment_confirmed")
        self.assertEqual(row["status"], "SENT")
        self.assertIn("created_at", row)
        self.assertIn("error", row)
        self.assertNotIn("9876543210", r.content.decode())

    def test_log_paginates(self):
        for i in range(3):
            send_sms(f"987654321{i}", "Hello", kind="test")
        r = self.auth(self.doctor).get(self.LOG + "?page=2&page_size=2")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["count"], 3)
        self.assertEqual(len(r.data["results"]), 1)
        self.assertEqual(r.data["page"], 2)
        bad = self.client.get(self.LOG + "?page=abc")
        self.assertEqual(bad.status_code, 400)

    def test_another_doctors_patient_sms_is_not_listed(self):
        other = UserProfile.objects.create_user(username="dr2", password="x-Pass-123!", role="DOCTOR")
        send_sms("9876543210", "Hi", kind="appointment_confirmed", related=self.appt_a, scheduled_for="x")
        r = self.auth(other).get(self.LOG)
        self.assertEqual(r.data["count"], 0)

    def test_send_test_sms(self):
        r = self.auth(self.doctor).post(self.TEST, {"to": "+91 98765 43210"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        msg = SmsMessage.objects.get(kind="test")
        self.assertEqual(msg.body, "Pet Physio Vet test message")
        self.assertEqual(msg.to, "+919876543210")
        self.assertEqual(msg.requested_by_id, self.doctor.id)
        self.assertEqual(r.data["status"], "SENT")
        self.assertEqual(r.data["to"], "*********3210")

    def test_send_test_rejects_a_bad_number(self):
        c = self.auth(self.doctor)
        for body in ({}, {"to": ""}, {"to": "98ab543210"}, {"to": "12345"}):
            with self.subTest(body=body):
                self.assertEqual(c.post(self.TEST, body, format="json").status_code, 400)
        self.assertFalse(SmsMessage.objects.exists())

    @override_settings(SMS_DAILY_LIMIT=1)
    def test_test_sms_counts_toward_the_cap(self):
        _sent(1)
        r = self.auth(self.doctor).post(self.TEST, {"to": "9876543210"}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["status"], "SKIPPED_LIMIT")


class VercelCronConfigTests(SimpleTestCase):
    def test_cron_is_scheduled_daily_at_0900_ist(self):
        cfg = json.loads((Path(__file__).resolve().parents[3] / "vercel.json").read_text())
        self.assertIn({"path": "/api/v1/cron/sms-reminders", "schedule": "30 3 * * *"}, cfg.get("crons", []))
