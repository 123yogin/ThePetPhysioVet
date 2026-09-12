"""Notification preferences: validation, and that a read stays a read.

Found by tapping through the release APK on an emulator: the SMS Reminders
screen accepted `9800r91879` -- a phone number with a letter in it -- and the
live API stored it as the unique key of a NotificationPref row.

Two separate faults, both covered here:

1. The view reads `owner_phone` straight off the request, so it never passed
   through a serializer and no validator ran. Every other phone entry point
   goes through `validators.normalise_phone`; this one did not.
2. `GET` used `get_or_create`, so *looking up* a number wrote a row. The screen
   offers a "Look Up" box, so a typo was enough to create permanent junk keyed
   on an uncallable number.

Traceability: CLAUDE.md rule 7; docs/API_CONTRACT.md (notification-prefs).
"""

from appointments.models import NotificationPref

from .base import API, ApiTestCase


class NotificationPrefValidationTests(ApiTestCase):
    URL = f"{API}/notification-prefs"

    def test_get_rejects_a_phone_with_a_letter_in_it(self):
        res = self.auth(self.doctor).get(self.URL, {"owner_phone": "9800r91879"})
        self.assertEqual(res.status_code, 400)
        self.assertFalse(
            NotificationPref.objects.filter(owner_phone="9800r91879").exists(),
            "a rejected lookup must not leave a row behind",
        )

    def test_put_rejects_a_phone_with_a_letter_in_it(self):
        res = self.auth(self.doctor).put(
            self.URL, {"owner_phone": "9800r91879", "sms_opt_out": True}, format="json"
        )
        self.assertEqual(res.status_code, 400)
        self.assertFalse(NotificationPref.objects.filter(owner_phone="9800r91879").exists())

    def test_get_does_not_create_a_row(self):
        """A read must not write, even for a perfectly valid number."""
        before = NotificationPref.objects.count()
        res = self.auth(self.doctor).get(self.URL, {"owner_phone": "9998887777"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["sms_opt_out"], False)
        self.assertIsNone(res.data["id"], "an absent pref reports no id rather than a new row")
        self.assertEqual(NotificationPref.objects.count(), before)

    def test_put_creates_and_then_get_reads_it_back(self):
        res = self.auth(self.doctor).put(
            self.URL, {"owner_phone": "9998887777", "sms_opt_out": True}, format="json"
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["sms_opt_out"])

        res = self.auth(self.doctor).get(self.URL, {"owner_phone": "9998887777"})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["sms_opt_out"])
        self.assertIsNotNone(res.data["id"])

    def test_the_same_number_written_two_ways_is_one_row(self):
        """Separators are stripped, so an opt-out cannot be stranded on a twin row."""
        self.auth(self.doctor).put(
            self.URL, {"owner_phone": "98888 77766", "sms_opt_out": True}, format="json"
        )
        res = self.auth(self.doctor).get(self.URL, {"owner_phone": "9888877766"})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["sms_opt_out"], "the opt-out must survive a reformat")
        self.assertEqual(NotificationPref.objects.filter(owner_phone="9888877766").count(), 1)

    def test_an_owner_still_cannot_read_another_owners_prefs(self):
        """The added validation must not have opened the ownership gate."""
        res = self.auth(self.owner_a).get(self.URL, {"owner_phone": self.owner_b.phone})
        self.assertEqual(res.status_code, 404)
