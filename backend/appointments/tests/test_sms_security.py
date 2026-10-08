"""Security-review fixes for transactional SMS (2026-10-08).

HIGH: an owner could create a Pending booking for a pet carrying ANY phone
number, "accept" it themselves (no doctor involved), and the cron would then
text that number -- an SMS relay paid for by the clinic's SIM. The PoC
(owner pet -> 3 owner bookings -> owner accept -> run_daily_reminders) is
reproduced in OwnerSelfConfirmTests. Fixed three ways: accept only works on a
doctor's reschedule; reminders only go to visits a doctor confirmed
(Appointment.confirmed_at/confirmed_by); and numbers outside
SMS_ALLOWED_COUNTRY_CODES, or over SMS_PER_PHONE_DAILY_LIMIT, are skipped.

Plus: the cron circuit breaker counts only provider failures (M1), the
gateway is only auto-selected on Vercel production (M2), the daily cap is
serialised and counts sends that timed out (M3), redirects are not followed
(L1), provider text is scrubbed of phone numbers (L2), reschedules text the
new time (L4), test SMS obeys the allowlist (L5), opt-out matches every
written form of a number (L6).
"""
import http.server
import json
import threading
from datetime import time, timedelta
from pathlib import Path
from unittest.mock import patch
from urllib.error import URLError

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, override_settings
from django.utils import timezone

from appointments.models import Appointment, Enquiry, NotificationPref, SmsMessage
from appointments.sms import send_sms, to_e164
from appointments.sms.triggers import run_daily_reminders
from .base import API, ApiTestCase
from .test_sms import GATEWAY, URLOPEN, accepted, http_error

TOMORROW = lambda: timezone.localdate() + timedelta(days=1)  # noqa: E731


# ------------------------------------------------------------ HIGH: relay --
@override_settings(SMS_BACKEND="console")
class OwnerSelfConfirmTests(ApiTestCase):
    def test_poc_owner_self_confirm_no_longer_texts_anyone(self):
        c = self.auth(self.owner_a)
        r = c.post(f"{API}/owner/pets", {"name": "Spam1", "species": "Dog", "owner_phone": "+447700900123"},
                   format="json")
        self.assertEqual(r.status_code, 201, r.content)
        pid = r.data["id"]
        ids = []
        for t in ("10:00", "10:15", "10:30"):
            r = c.post(f"{API}/owner/appointments",
                       {"pet_id": pid, "date": TOMORROW().isoformat(), "time": t, "visit_type": "Initial"},
                       format="json")
            self.assertEqual(r.status_code, 201, r.content)
            ids.append(r.data["id"])
        for i in ids:
            r = c.post(f"{API}/owner/appointments/{i}/accept", format="json")
            self.assertEqual(r.status_code, 400, r.content)
            self.assertEqual(Appointment.objects.get(pk=i).status, "Pending")
        run_daily_reminders()
        self.assertFalse(SmsMessage.objects.exists())

    def test_owner_cannot_accept_their_own_reschedule_request(self):
        c = self.auth(self.owner_a)
        r = c.post(f"{API}/owner/appointments/{self.appt_a.id}/reschedule-request",
                   {"date": TOMORROW().isoformat(), "time": "15:00"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        r = c.post(f"{API}/owner/appointments/{self.appt_a.id}/accept", format="json")
        self.assertEqual(r.status_code, 400)
        self.appt_a.refresh_from_db()
        self.assertEqual(self.appt_a.status, "Reschedule Requested")

    def test_owner_can_accept_a_doctor_reschedule(self):
        r = self.auth(self.doctor).post(f"{API}/appointments/{self.appt_a.id}/reschedule",
                                        {"date": TOMORROW().isoformat(), "time": "15:00"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        r = self.auth(self.owner_a).post(f"{API}/owner/appointments/{self.appt_a.id}/accept", format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.appt_a.refresh_from_db()
        self.assertEqual(self.appt_a.status, "Confirmed")
        self.assertIsNotNone(self.appt_a.confirmed_at)

    def test_reminders_need_a_doctor_and_a_doctor_confirmation(self):
        base = dict(pet=self.pet_a, pet_name="Rex", owner_name="A", owner_phone="9991110001",
                    date=TOMORROW(), status="Confirmed")
        Appointment.objects.create(doctor=self.doctor, time=time(9, 0), **base)          # never confirmed
        Appointment.objects.create(doctor=None, time=time(9, 30), confirmed_at=timezone.now(), **base)
        ok = Appointment.objects.create(doctor=self.doctor, time=time(10, 0), confirmed_at=timezone.now(),
                                        confirmed_by=self.doctor, **base)
        run_daily_reminders()
        self.assertEqual(list(SmsMessage.objects.values_list("appointment_id", flat=True)), [ok.id])

    def test_every_doctor_action_records_the_confirmation(self):
        d = self.auth(self.doctor)
        when = (timezone.localdate() + timedelta(days=4)).isoformat()

        pending = Appointment.objects.create(pet=self.pet_a, doctor=self.doctor, pet_name="Rex", owner_name="A",
                                             owner_phone="9991110001", date=TOMORROW(), time=time(8, 0),
                                             status="Pending")
        d.post(f"{API}/appointments/{pending.id}/confirm")
        created = d.post(f"{API}/appointments", {
            "pet": str(self.pet_a.id), "pet_id": str(self.pet_a.id), "pet_name": "Rex", "owner_name": "A",
            "owner_phone": "9991110001", "date": when, "time": "12:00", "visit_type": "Initial",
        }, format="json")
        self.assertEqual(created.status_code, 201, created.content)
        d.post(f"{API}/appointments/{self.appt_b.id}/reschedule", {"date": when, "time": "13:00"}, format="json")
        enq = Enquiry.objects.create(first_name="N", last_name="O", pet_name="Bo", email="n@example.com",
                                     phone="9001112222")
        conv = d.post(f"{API}/enquiries/{enq.id}/convert",
                      {"date": when, "time": "14:00", "visit_type": "Hydrotherapy"}, format="json")
        self.assertEqual(conv.status_code, 200, conv.content)

        converted = Enquiry.objects.get(pk=enq.id).converted_appointment_id
        for appt_id in (pending.id, created.data["id"], self.appt_b.id, converted):
            a = Appointment.objects.get(pk=appt_id)
            with self.subTest(appt=str(appt_id)):
                self.assertIsNotNone(a.confirmed_at)
                self.assertEqual(a.confirmed_by_id, self.doctor.id)

    def test_reschedule_approve_and_reject_record_the_confirmation(self):
        o = self.auth(self.owner_a)
        o.post(f"{API}/owner/appointments/{self.appt_a.id}/reschedule-request",
               {"date": TOMORROW().isoformat(), "time": "15:00"}, format="json")
        r = self.auth(self.doctor).post(f"{API}/appointments/{self.appt_a.id}/reschedule-approve")
        self.assertEqual(r.status_code, 200)
        self.appt_a.refresh_from_db()
        self.assertEqual(self.appt_a.confirmed_by_id, self.doctor.id)


# --------------------------------------------- country + per-phone limits --
@override_settings(**GATEWAY)
class CountryAndPerPhoneTests(ApiTestCase):
    def test_only_allowed_country_codes_fold_to_e164(self):
        self.assertIsNone(to_e164("+447700900123"))
        self.assertEqual(to_e164("98765 43210"), "+919876543210")
        with override_settings(SMS_ALLOWED_COUNTRY_CODES=("+91", "+44")):
            self.assertEqual(to_e164("+44 7700 900123"), "+447700900123")

    def test_other_countries_are_skipped_with_a_reason(self):
        with patch(URLOPEN) as op:
            msg = send_sms("+447700900123", "hi", kind="test")
        op.assert_not_called()
        self.assertEqual(msg.status, "SKIPPED_COUNTRY")
        self.assertIn("+44", msg.error)

    def test_test_sms_endpoint_uses_the_same_allowlist(self):
        r = self.auth(self.doctor).post(f"{API}/sms/test", {"to": "+447700900123"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertFalse(SmsMessage.objects.exists())

    @override_settings(SMS_PER_PHONE_DAILY_LIMIT=3)
    def test_per_phone_daily_limit(self):
        with patch(URLOPEN, side_effect=accepted):
            first = [send_sms("98765 43210", f"m{i}", kind="test").status for i in range(3)]
        with patch(URLOPEN) as op:
            fourth = send_sms("+919876543210", "m4", kind="test")
        op.assert_not_called()
        self.assertEqual(first, ["SENT"] * 3)
        self.assertEqual(fourth.status, "SKIPPED_LIMIT")
        self.assertIn("this number", fourth.error)
        with patch(URLOPEN, side_effect=accepted):
            self.assertEqual(send_sms("9876543211", "other", kind="test").status, "SENT")

    def test_opt_out_matches_every_written_form(self):
        NotificationPref.objects.create(owner_phone="00919876543210", sms_opt_out=True)
        with patch(URLOPEN) as op:
            msg = send_sms("98765 43210", "hi", kind="test")
        op.assert_not_called()
        self.assertEqual(msg.status, "SKIPPED_OPTOUT")


class SmsSettingsSecurityTests(SimpleTestCase):
    def test_gateway_is_only_auto_selected_on_vercel_production(self):
        from petphysio.settings import _sms_backend_choice as choose
        creds = {"SMS_GATEWAY_USERNAME": "u", "SMS_GATEWAY_PASSWORD": "p"}
        self.assertEqual(choose(creds, debug=False), "disabled")
        self.assertEqual(choose({**creds, "VERCEL_ENV": "preview"}, debug=False), "disabled")
        self.assertEqual(choose({**creds, "VERCEL_ENV": "production"}, debug=False), "android_gateway")
        self.assertEqual(choose({"VERCEL_ENV": "production"}, debug=False), "disabled")
        self.assertEqual(choose({**creds, "SMS_BACKEND": "android_gateway"}, debug=False), "android_gateway")

    def test_country_codes_setting(self):
        from petphysio.settings import _sms_allowed_country_codes as codes
        self.assertEqual(codes({}), ("+91",))
        self.assertEqual(codes({"SMS_ALLOWED_COUNTRY_CODES": "91, +44"}), ("+91", "+44"))
        for bad in ("abc", "+", "+12345"):
            with self.subTest(bad=bad), self.assertRaises(ImproperlyConfigured):
                codes({"SMS_ALLOWED_COUNTRY_CODES": bad})

    def test_per_phone_limit_setting(self):
        from petphysio.settings import _sms_per_phone_daily_limit as limit
        self.assertEqual(limit({}), 3)
        with self.assertRaises(ImproperlyConfigured):
            limit({"SMS_PER_PHONE_DAILY_LIMIT": "0"})

    def test_cron_runs_twice_a_morning(self):
        cfg = json.loads((Path(__file__).resolve().parents[3] / "vercel.json").read_text())
        paths = [c for c in cfg["crons"] if c["path"] == "/api/v1/cron/sms-reminders"]
        self.assertEqual(sorted(c["schedule"] for c in paths), ["30 3 * * *", "30 4 * * *"])


# ------------------------------------------------- M1 breaker, M3 the cap --
@override_settings(**GATEWAY, SMS_DAILY_LIMIT=90)
class BreakerAndCapTests(ApiTestCase):
    def _confirmed(self, phone, hhmm):
        return Appointment.objects.create(
            pet=self.pet_a, doctor=self.doctor, pet_name="Rex", owner_name="x", owner_phone=phone,
            date=TOMORROW(), time=time(*hhmm), status="Confirmed",
            confirmed_at=timezone.now(), confirmed_by=self.doctor,
        )

    def test_bad_numbers_do_not_trip_the_breaker(self):
        for i in range(3):
            self._confirmed("12345", (8, i * 5))
        good = self._confirmed("9991110001", (12, 0))
        with patch(URLOPEN, side_effect=accepted) as op:
            res = run_daily_reminders()
        self.assertEqual(op.call_count, 1)
        self.assertEqual(res["appointment_reminders"]["failed"], 3)
        self.assertEqual(res["appointment_reminders"]["deferred"], 0)
        self.assertEqual(SmsMessage.objects.get(appointment=good).status, "SENT")

    @override_settings(SMS_DAILY_LIMIT=1)
    def test_a_timed_out_send_counts_toward_the_cap(self):
        with patch(URLOPEN, side_effect=TimeoutError("timed out")):
            first = send_sms("9876543210", "a", kind="test")
        self.assertEqual(first.status, "FAILED")
        with patch(URLOPEN) as op:
            second = send_sms("9876543211", "b", kind="test")
        op.assert_not_called()
        self.assertEqual(second.status, "SKIPPED_LIMIT")

    @override_settings(SMS_DAILY_LIMIT=1)
    def test_a_refused_connection_does_not_use_up_the_cap(self):
        with patch(URLOPEN, side_effect=URLError(ConnectionRefusedError("refused"))):
            send_sms("9876543210", "a", kind="test")
        with patch(URLOPEN, side_effect=accepted):
            self.assertEqual(send_sms("9876543211", "b", kind="test").status, "SENT")

    @override_settings(SMS_DAILY_LIMIT=1)
    def test_a_timed_out_reminder_is_retried_and_not_double_counted(self):
        kw = dict(kind="appointment_reminder", related=self.appt_a, scheduled_for="d")
        with patch(URLOPEN, side_effect=TimeoutError()):
            send_sms("9991110001", "hi", **kw)
        with patch(URLOPEN, side_effect=http_error(409)) as op:  # the gateway had it
            again = send_sms("9991110001", "hi", **kw)
        self.assertEqual(op.call_count, 1)
        self.assertEqual(again.status, "SENT")

    def test_cap_check_and_send_run_under_the_send_lock(self):
        from appointments.sms import service
        with patch.object(service, "_lock_sends", wraps=service._lock_sends) as lock, \
                patch(URLOPEN, side_effect=accepted):
            send_sms("9876543210", "a", kind="test")
        lock.assert_called_once()


# ------------------------------------------------- L1 redirects, L2 scrub --
class _Redirector(http.server.BaseHTTPRequestHandler):
    hits = []

    def do_POST(self):  # noqa: N802
        _Redirector.hits.append(self.path)
        if self.path.endswith("/messages"):
            self.send_response(307)
            self.send_header("Location", "/stolen")
            self.end_headers()
        else:
            self.send_response(202)
            self.end_headers()

    def log_message(self, *a):
        pass


class GatewayHardeningTests(ApiTestCase):
    def test_redirects_are_not_followed(self):
        srv = http.server.HTTPServer(("127.0.0.1", 0), _Redirector)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        _Redirector.hits = []
        try:
            with override_settings(**{**GATEWAY, "SMS_GATEWAY_URL": f"http://127.0.0.1:{srv.server_port}/v1"}):
                msg = send_sms("9876543210", "hi", kind="test")
        finally:
            srv.shutdown()
        self.assertEqual(_Redirector.hits, ["/v1/messages"])
        self.assertEqual(msg.status, "FAILED")
        self.assertIn("307", msg.error)

    @override_settings(**GATEWAY)
    def test_provider_text_is_scrubbed_of_phone_numbers(self):
        body = b'{"message":"invalid phone +919876543210 for user 12345678"}'
        with self.assertLogs("appointments.sms", "INFO") as logs, patch(URLOPEN, side_effect=http_error(400, body)):
            msg = send_sms("9876543210", "hi", kind="test")
        self.assertEqual(msg.status, "FAILED")
        everything = msg.error + "\n".join(logs.output)
        self.assertNotIn("9876543210", everything)
        self.assertNotIn("12345678", everything)

    @override_settings(SMS_WEBHOOK_SIGNING_KEY="k")
    def test_webhook_reason_is_scrubbed(self):
        from appointments.sms.webhook import apply_event
        SmsMessage.objects.create(to="+919876543210", body="x", kind="test", status="SENT",
                                  provider_id="gw-1", idempotency_key="t:1", sent_at=timezone.now())
        apply_event("sms:failed", {"messageId": "gw-1", "reason": "no route to +919876543210"})
        self.assertNotIn("9876543210", SmsMessage.objects.get(provider_id="gw-1").error)


# ------------------------------------------------------- L4 reschedules --
@override_settings(SMS_BACKEND="console", CLINIC_NAME="Pet Physio Vet", CLINIC_PHONE="+91 72840 73241")
class RescheduleSmsTests(ApiTestCase):
    def test_doctor_reschedule_texts_the_new_time_once_per_slot(self):
        d = self.auth(self.doctor)
        for _ in range(2):
            r = d.post(f"{API}/appointments/{self.appt_a.id}/reschedule",
                       {"date": "2030-01-03", "time": "11:00"}, format="json")
            self.assertEqual(r.status_code, 200, r.content)
        msgs = SmsMessage.objects.filter(kind="appointment_moved", appointment=self.appt_a)
        self.assertEqual(msgs.count(), 1)
        self.assertEqual(
            msgs[0].body,
            "Pet Physio Vet: Rex's appointment has moved to Thu 3 Jan, 11:00 AM. Call +91 72840 73241 to change.",
        )
        d.post(f"{API}/appointments/{self.appt_a.id}/reschedule", {"date": "2030-01-04", "time": "11:00"},
               format="json")
        self.assertEqual(SmsMessage.objects.filter(kind="appointment_moved").count(), 2)

    def test_approving_an_owner_request_texts_the_new_time(self):
        self.auth(self.owner_a).post(f"{API}/owner/appointments/{self.appt_a.id}/reschedule-request",
                                     {"date": "2030-01-03", "time": "16:30"}, format="json")
        r = self.auth(self.doctor).post(f"{API}/appointments/{self.appt_a.id}/reschedule-approve")
        self.assertEqual(r.status_code, 200)
        msg = SmsMessage.objects.get(kind="appointment_moved")
        self.assertIn("moved to Thu 3 Jan, 4:30 PM", msg.body)
