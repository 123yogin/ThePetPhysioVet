"""The public enquiry form's honeypot.

`POST /enquiries` is the only unauthenticated write in the app. It was already
rate limited per IP and per email, which caps the damage a flood can do, but
nothing stopped a single well-behaved bot submitting steadily inside those
limits and filling the clinic's inbox with rubbish.

`website` is a field no person can reach -- visually hidden, aria-hidden and
tabindex=-1 -- so anything that fills it is automated.

The response is a normal 201, not a rejection: a bot told it was caught is a
bot that gets retuned. What matters is that no row is written.

Traceability: CLAUDE.md rule 7.
"""

from appointments.models import Enquiry

from .base import API, ApiTestCase

VALID = {
    "firstName": "Asha",
    "petName": "Simba",
    "email": "asha@example.com",
    "phone": "9876543210",
}


class EnquiryHoneypotTests(ApiTestCase):

    def test_a_filled_honeypot_writes_nothing(self):
        before = Enquiry.objects.count()
        res = self.anon().post(
            f"{API}/enquiries", {**VALID, "website": "http://spam.example"}, format="json"
        )
        self.assertEqual(res.status_code, 201, "the bot must not learn it was caught")
        self.assertEqual(Enquiry.objects.count(), before, "no row may be written")

    def test_the_response_is_not_obviously_a_rejection(self):
        res = self.anon().post(
            f"{API}/enquiries", {**VALID, "website": "x"}, format="json"
        )
        self.assertIn("reference", res.data)
        self.assertIn("detail", res.data)
        for giveaway in ("spam", "bot", "honeypot", "rejected", "blocked"):
            self.assertNotIn(giveaway, str(res.data).lower())

    def test_a_real_submission_still_works(self):
        before = Enquiry.objects.count()
        res = self.anon().post(f"{API}/enquiries", VALID, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(Enquiry.objects.count(), before + 1)
        self.assertIsNotNone(res.data["id"])

    def test_an_empty_honeypot_is_treated_as_a_real_submission(self):
        """A browser that posts the field as an empty string must not be blocked."""
        before = Enquiry.objects.count()
        res = self.anon().post(f"{API}/enquiries", {**VALID, "website": ""}, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(Enquiry.objects.count(), before + 1)

    def test_whitespace_only_counts_as_empty(self):
        """Deliberately lenient, because this honeypot discards silently.

        A false positive costs a real owner their enquiry with no error shown to
        anyone -- so the bar for "this is a bot" has to be content, not stray
        whitespace a client might send on its own. Bots fill honeypots with URLs
        and text, not spaces.
        """
        before = Enquiry.objects.count()
        res = self.anon().post(f"{API}/enquiries", {**VALID, "website": "   "}, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(
            Enquiry.objects.count(), before + 1,
            "whitespace must not silently swallow a genuine enquiry",
        )
