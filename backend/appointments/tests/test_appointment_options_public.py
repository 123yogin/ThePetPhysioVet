"""`GET /appointment-options` is public.

The clinic's marketing site needs the service list to offer a therapy
dropdown. Keeping it behind a session would force that site to hardcode the
vocabulary, and three forms each inventing their own `visit_type` wording is
the documented root cause of every booking returning 400 (see the B1/B2 note
on the view).

The response is service *names* only -- nothing about a patient, an
appointment or a user -- so there is nothing here to protect.

Also pinned: a stale bearer token must not break it. DRF applies
JWTAuthentication globally and SimpleJWT raises on an expired token, so a
visitor carrying one from an old session would otherwise be refused on a page
that never asked them to sign in -- the same fault that locked users out of
/auth/login.

Traceability: CLAUDE.md rule 7; docs/API_CONTRACT.md §3.
"""

from datetime import timedelta

from rest_framework_simplejwt.tokens import RefreshToken

from appointments.models import Appointment

from .base import API, ApiTestCase

URL = f"{API}/appointment-options"


class AppointmentOptionsArePublicTests(ApiTestCase):

    def test_an_anonymous_visitor_gets_the_list(self):
        res = self.anon().get(URL)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["visit_types"])

    def test_the_list_is_exactly_what_booking_accepts(self):
        """The point of the endpoint: the site cannot advertise a therapy that
        booking would then reject."""
        res = self.anon().get(URL)
        served = [v["value"] for v in res.data["visit_types"]]
        self.assertEqual(served, [value for value, _label in Appointment.VISIT_TYPES])

    def test_an_expired_token_does_not_break_it(self):
        token = RefreshToken.for_user(self.doctor).access_token
        token.set_exp(lifetime=timedelta(seconds=-1))
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        res = self.client.get(URL)
        self.assertEqual(
            res.status_code, 200,
            "a stale token from an old session must not refuse a public page",
        )

    def test_signed_in_callers_still_get_it(self):
        for user in (self.doctor, self.owner_a):
            with self.subTest(role=user.role):
                self.assertEqual(self.auth(user).get(URL).status_code, 200)

    def test_it_exposes_nothing_but_the_vocabulary(self):
        """A public endpoint must not grow a field that leaks clinic data.

        The allowed set is written out rather than inferred, so adding a field
        here is a decision someone has to make on purpose. It has been widened
        once, on 2026-09-18, for `public`: a boolean saying whether the
        marketing site may offer that service. It reveals nothing a visitor
        could not already infer -- the labels either side of it were public
        before -- and it exists so the website cannot drift from the bookable
        list. Anything carrying patient, pricing or availability data does not
        belong in this response at all.
        """
        res = self.anon().get(URL)
        self.assertEqual(set(res.data.keys()), {"visit_types"})
        for entry in res.data["visit_types"]:
            self.assertEqual(set(entry.keys()), {"value", "label", "public"})
            self.assertIsInstance(entry["public"], bool)

    def test_the_public_subset_excludes_the_clinical_stages(self):
        """Initial / Follow-up / Re-assessment are stages of a course of care.

        A first-time visitor cannot sensibly request a re-assessment, so the
        public site does not offer them -- but the clinic still books them.
        """
        res = self.anon().get(URL)
        public = {v["value"] for v in res.data["visit_types"] if v["public"]}
        for stage in ("Initial", "Followup", "Reassessment"):
            self.assertNotIn(stage, public)
        for service in ("Hydrotherapy", "Physiotherapy", "Grooming", "Walking"):
            self.assertIn(service, public)
