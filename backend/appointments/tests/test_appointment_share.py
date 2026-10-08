"""QA r4: GET /appointments/{id}/share built wa.me links from the raw ten
digits (no country code -> WhatsApp opens "invalid number") and always said
"reminder" even for a just-confirmed booking."""
import datetime
from urllib.parse import unquote

from django.utils import timezone

from appointments.validators import whatsapp_phone_digits

from .base import API, ApiTestCase


class WhatsappDigitsTests(ApiTestCase):
    def test_indian_forms_fold_to_91_prefix(self):
        for raw in ["9876543210", "+91 98765 43210", "919876543210", "09876543210",
                    "0091 98765-43210", "+919876543210"]:
            self.assertEqual(whatsapp_phone_digits(raw), "919876543210", raw)

    def test_international_number_kept(self):
        self.assertEqual(whatsapp_phone_digits("+44 7700 900123"), "447700900123")
        self.assertEqual(whatsapp_phone_digits("+1 (415) 555-0100"), "14155550100")

    def test_garbage_is_empty(self):
        self.assertEqual(whatsapp_phone_digits(""), "")
        self.assertEqual(whatsapp_phone_digits(None), "")
        self.assertEqual(whatsapp_phone_digits("12"), "")


class AppointmentShareTests(ApiTestCase):
    def _share(self, appt):
        self.auth(self.doctor)
        r = self.client.get(f"{API}/appointments/{appt.id}/share")
        self.assertEqual(r.status_code, 200, r.content)
        return r.data

    def _future(self, appt, status="Confirmed"):
        appt.date = timezone.localdate() + datetime.timedelta(days=3)
        appt.status = status
        appt.save()
        return appt

    def test_whatsapp_url_has_country_code_and_sms_is_e164(self):
        data = self._share(self._future(self.appt_a))
        self.assertTrue(data["whatsapp_url"].startswith("https://wa.me/919991110001?text="),
                        data["whatsapp_url"])
        self.assertTrue(data["sms_url"].startswith("sms:+919991110001?"), data["sms_url"])

    def test_confirmed_upcoming_says_confirmed_with_clinic_name(self):
        self.doctor.clinic_name = "Happy Paws Clinic"
        self.doctor.save()
        data = self._share(self._future(self.appt_a))
        text = unquote(data["whatsapp_url"].split("text=", 1)[1])
        self.assertIn("is confirmed for", text)
        self.assertIn("Happy Paws Clinic", text)
        self.assertNotIn("reminder", text.lower())

    def test_rescheduled_upcoming_says_confirmed(self):
        data = self._share(self._future(self.appt_a, status="Rescheduled"))
        text = unquote(data["whatsapp_url"].split("text=", 1)[1])
        self.assertIn("is confirmed for", text)
        self.assertIn("The Pet Physio Vet", text)  # fallback clinic name

    def test_pending_says_reminder(self):
        data = self._share(self._future(self.appt_a, status="Pending"))
        text = unquote(data["whatsapp_url"].split("text=", 1)[1])
        self.assertIn("reminder", text.lower())
        self.assertNotIn("is confirmed for", text)

    def test_past_confirmed_says_reminder(self):
        self.appt_a.date = timezone.localdate() - datetime.timedelta(days=2)
        self.appt_a.save()
        data = self._share(self.appt_a)
        text = unquote(data["whatsapp_url"].split("text=", 1)[1])
        self.assertNotIn("is confirmed for", text)

    def test_international_owner_phone_kept(self):
        self.appt_a.owner_phone = "+44 7700 900123"
        self.appt_a.save()
        data = self._share(self._future(self.appt_a))
        self.assertTrue(data["whatsapp_url"].startswith("https://wa.me/447700900123?"))
        self.assertTrue(data["sms_url"].startswith("sms:+447700900123?"))
