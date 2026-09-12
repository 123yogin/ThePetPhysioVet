"""RFC-7807 error bodies: one 404 wording, and no envelope key as a field label.

Both found by probing the live API as a freshly registered owner.

1. **Two distinguishable 404s.** `petphysio/exceptions.py` rewrote the body only
   when it matched Django's `get_object_or_404` phrasing, so a view raising
   `NotFound` for an object that exists but is not yours came back differently:

       GET /owner/pets/<another owner's pet>  -> "detail: Not found."
       GET /owner/pets/<no such pet>          -> "That record does not exist, ..."

   The short message means "this id is real, just not yours" -- the enumeration
   oracle that module's own docstring says must not exist, and that rule 4's
   choice of 404-over-403 is there to prevent.

2. **`detail` labelled as a field.** DRF reports `APIException` as
   `{"detail": "..."}`; the flattener treated that key as a form field name, so
   users saw "detail: This action requires a doctor account." and
   'detail: Method "POST" not allowed.'

Traceability: CLAUDE.md rule 4 and rule 7; docs/API_CONTRACT.md (error shape).
"""

from appointments.models import Pet

from .base import API, ApiTestCase

CANONICAL_404 = "That record does not exist, or you do not have access to it."


class NotFoundIsIndistinguishableTests(ApiTestCase):
    """A 404 must not reveal whether the row exists."""

    MISSING = "00000000-0000-4000-8000-000000000000"

    def test_another_owners_pet_and_a_missing_pet_read_identically(self):
        res_theirs = self.auth(self.owner_a).get(f"{API}/owner/pets/{self.pet_b.id}")
        res_missing = self.auth(self.owner_a).get(f"{API}/owner/pets/{self.MISSING}")

        self.assertEqual(res_theirs.status_code, 404)
        self.assertEqual(res_missing.status_code, 404)
        self.assertEqual(
            res_theirs.data,
            res_missing.data,
            "a 404 for someone else's row must be byte-identical to one for a row "
            "that was never there, or the difference is an existence oracle",
        )

    def test_the_wording_is_the_canonical_one(self):
        res = self.auth(self.owner_a).get(f"{API}/owner/pets/{self.pet_b.id}")
        self.assertEqual(res.data["detail"], CANONICAL_404)
        self.assertEqual(res.data["title"], "Not found")
        self.assertEqual(res.data["status"], 404)

    def test_a_doctor_route_404_uses_the_same_wording(self):
        """The rule holds for the doctor side too, not just /owner/*."""
        res = self.auth(self.doctor).get(f"{API}/pets/{self.MISSING}")
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.data["detail"], CANONICAL_404)

    def test_no_404_body_ever_names_the_model(self):
        """Django's "No Pet matches the given query." must never reach a user."""
        for url in (
            f"{API}/owner/pets/{self.pet_b.id}",
            f"{API}/owner/pets/{self.MISSING}",
            f"{API}/pets/{self.MISSING}",
        ):
            res = self.auth(self.owner_a if "/owner/" in url else self.doctor).get(url)
            self.assertNotIn("Pet", res.data["detail"], url)
            self.assertNotIn("matches the given query", res.data["detail"], url)


class ExpiredTokenTests(ApiTestCase):
    """An expired session is a session problem, not a diagnostic report.

    Shipped and seen in production on the sign-in page:

        Given token not valid for any token type code: token_not_valid messages:
        {'token_class': ErrorDetail(string='AccessToken', code='token_not_valid'),
         'token_type': ErrorDetail(string='access', code='token_not_valid'),
         'message': ErrorDetail(string='Token is expired', code='token_not_valid')}

    Two faults at once: SimpleJWT's diagnostic keys were rendered to a user, and
    `messages` is a list of dicts, which the flattener stringified into a Python
    repr. Both are covered here.
    """

    def test_an_expired_token_reads_as_a_session_message(self):
        token = self._expired(self._access_for(self.doctor))
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        res = self.client.get(f"{API}/pets")

        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.data["detail"], "Your session has expired. Please sign in again.")

    def test_no_internals_reach_the_user(self):
        token = self._expired(self._access_for(self.doctor))
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        body = self.client.get(f"{API}/pets").data["detail"]

        for leak in ("ErrorDetail", "token_not_valid", "token_class", "AccessToken", "{", "}"):
            self.assertNotIn(leak, body, f"{leak!r} must not reach a user")

    def test_a_list_of_dicts_is_never_stringified(self):
        """Defence in depth: even unrecognised nesting must not emit a repr."""
        from petphysio.exceptions import _flatten

        out = _flatten({"messages": [{"token_class": "AccessToken"}]})
        self.assertNotIn("{", out)
        self.assertIn("AccessToken", out)

    def _access_for(self, user):
        from rest_framework_simplejwt.tokens import RefreshToken
        return RefreshToken.for_user(user).access_token


class ProblemDetailWordingTests(ApiTestCase):
    """DRF's own envelope key is not a field name."""

    def test_permission_denied_is_not_prefixed_with_detail(self):
        res = self.auth(self.owner_a).get(f"{API}/pets")
        self.assertEqual(res.status_code, 403)
        self.assertNotIn("detail:", res.data["detail"])

    def test_method_not_allowed_is_not_prefixed_with_detail(self):
        res = self.auth(self.doctor).post(f"{API}/notification-prefs", {}, format="json")
        self.assertEqual(res.status_code, 405)
        self.assertNotIn("detail:", res.data["detail"])

    def test_a_serializer_field_still_gets_its_label(self):
        """Stripping the envelope must not strip real field names."""
        res = self.auth(self.doctor).post(
            f"{API}/pets", {"species": "Dog"}, format="json"
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("name", res.data["detail"])
        self.assertIn("errors", res.data)
