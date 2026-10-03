"""Clinic notification emails (appointments/notify.py).

Verifies that a new enquiry / facility booking / boarding stay emails the clinic,
that the feature is gated by NOTIFY_DOCTOR + DOCTOR_EMAIL, and — most importantly —
that a notification failure NEVER breaks the booking it is reacting to.

Django's test runner swaps in the locmem email backend, so mail.outbox captures
whatever notify.py sends.
"""
from datetime import date, timedelta
from unittest.mock import patch

from django.core import mail
from django.core.cache import cache
from django.test import override_settings

from appointments.models import BOARDING_DURATION_KEYS
from .base import ApiTestCase, API

ENQUIRY = {
    "firstName": "Priya", "lastName": "Sharma", "petName": "Bruno",
    "speciesBreed": "Golden Retriever", "email": "priya@example.com",
    "phone": "9123456780", "reason": "Limping on the left hind leg.",
}


def _tomorrow():
    return (date.today() + timedelta(days=1)).isoformat()


@override_settings(NOTIFY_DOCTOR=True, DOCTOR_EMAIL="vet@clinic.test")
class DoctorNotifyTests(ApiTestCase):
    def setUp(self):
        cache.clear()        # reset per-IP/phone rate limiters between tests
        mail.outbox = []

    # --- each public create path emails the clinic ---------------------------
    def test_enquiry_emails_the_clinic(self):
        r = self.anon().post(f"{API}/enquiries", ENQUIRY, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(len(mail.outbox), 1)
        m = mail.outbox[0]
        self.assertEqual(m.to, ["vet@clinic.test"])
        self.assertIn("New enquiry", m.subject)
        self.assertIn("Bruno", m.subject)
        html = m.alternatives[0][0]
        self.assertIn("Priya", html)
        self.assertIn("9123456780", html)
        self.assertIn("text/html", m.alternatives[0][1])

    def test_facility_booking_emails_the_clinic(self):
        ref = self.anon().post(
            f"{API}/facility/holds", {"date": _tomorrow(), "slots": [2]}, format="json"
        ).data["reference"]
        mail.outbox = []  # a hold alone must not notify
        r = self.anon().post(
            f"{API}/facility/holds/{ref}/confirm",
            {"petName": "Rex", "ownerName": "Owner One", "ownerPhone": "9000000001"},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("facility booking", mail.outbox[0].subject.lower())
        self.assertIn("Rex", mail.outbox[0].subject)

    # --- the "Open in portal" button deep-links to the matching screen --------
    @override_settings(FRONTEND_BASE_URL="https://www.thepetphysiovet.com/app")
    def test_each_kind_links_to_its_own_portal_screen(self):
        # enquiry -> /enquiries
        self.anon().post(f"{API}/enquiries", ENQUIRY, format="json")
        self.assertIn("https://www.thepetphysiovet.com/app/enquiries",
                      mail.outbox[-1].alternatives[0][0])
        # facility booking -> /facility
        ref = self.anon().post(
            f"{API}/facility/holds", {"date": _tomorrow(), "slots": [0]}, format="json"
        ).data["reference"]
        self.anon().post(
            f"{API}/facility/holds/{ref}/confirm",
            {"petName": "Rex", "ownerName": "O", "ownerPhone": "9000000001"}, format="json",
        )
        self.assertIn("https://www.thepetphysiovet.com/app/facility",
                      mail.outbox[-1].alternatives[0][0])
        # boarding -> /boarding
        self.anon().post(
            f"{API}/facility/boarding",
            {"petName": "Coco", "ownerName": "O", "ownerPhone": "9000000002",
             "checkIn": _tomorrow(), "duration": BOARDING_DURATION_KEYS[0], "termsAccepted": True},
            format="json",
        )
        self.assertIn("https://www.thepetphysiovet.com/app/boarding",
                      mail.outbox[-1].alternatives[0][0])

    def test_boarding_emails_the_clinic(self):
        r = self.anon().post(
            f"{API}/facility/boarding",
            {
                "petName": "Coco", "ownerName": "Owner Two", "ownerPhone": "9000000002",
                "checkIn": _tomorrow(), "duration": BOARDING_DURATION_KEYS[0],
                "termsAccepted": True,
            },
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("New boarding", mail.outbox[0].subject)
        self.assertIn("Coco", mail.outbox[0].subject)

    def test_a_hold_alone_does_not_notify(self):
        self.anon().post(f"{API}/facility/holds", {"date": _tomorrow(), "slots": [1]}, format="json")
        self.assertEqual(len(mail.outbox), 0)

    # --- gating ---------------------------------------------------------------
    def test_disabled_sends_nothing(self):
        with override_settings(NOTIFY_DOCTOR=False):
            r = self.anon().post(f"{API}/enquiries", ENQUIRY, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(len(mail.outbox), 0)

    def test_missing_recipient_is_safe(self):
        with override_settings(DOCTOR_EMAIL=""):
            r = self.anon().post(f"{API}/enquiries", ENQUIRY, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(len(mail.outbox), 0)

    # --- the hard rule: a send failure must never break the booking ----------
    def test_send_failure_never_breaks_the_booking(self):
        with patch(
            "appointments.notify.EmailMultiAlternatives.send",
            side_effect=RuntimeError("SMTP is down"),
        ):
            r = self.anon().post(f"{API}/enquiries", ENQUIRY, format="json")
        self.assertEqual(r.status_code, 201, r.content)  # booking still succeeds
        self.assertEqual(len(mail.outbox), 0)
