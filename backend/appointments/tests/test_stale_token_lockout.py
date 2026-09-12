"""A dead bearer token must not block the routes that exist to replace it.

Reported from production: a user opened the app, typed correct credentials, and
got back

    Given token not valid for any token type code: token_not_valid messages: ...

instead of a session. The browser still held an expired access token from an
earlier visit, the SPA attaches whatever token it has to every request, and DRF
applies JWTAuthentication globally -- SimpleJWT *raises* on a bad token, so the
401 is produced before `AllowAny` is ever consulted.

The result was a permanent lockout rather than an inconvenience: password reset
does not clear localStorage, so the next sign-in failed the same way, and only
clearing site data recovered the account.

`authentication_classes([])` was already on the two password-reset views for
exactly this reason (see the note in views/auth.py). It was missing from login,
signup and refresh -- refresh worst of all, since that route exists to be called
*with* an expired access token.

Traceability: CLAUDE.md rule 7; docs/API_CONTRACT.md §3 (auth).
"""

from datetime import timedelta

from rest_framework_simplejwt.tokens import RefreshToken

from .base import API, ApiTestCase


def _dead_access_token(user):
    """A real, correctly signed access token that is simply past its expiry."""
    token = RefreshToken.for_user(user).access_token
    token.set_exp(lifetime=timedelta(seconds=-1))
    return str(token)


class StaleTokenDoesNotBlockAuthRoutesTests(ApiTestCase):

    def setUp(self):
        super().setUp()
        self.dead = _dead_access_token(self.doctor)

    def _with_dead_token(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.dead}")
        return self.client

    def test_login_succeeds_despite_an_expired_token_in_the_header(self):
        res = self._with_dead_token().post(
            f"{API}/auth/login",
            {"username": "drwho", "password": "D0ctorPass!23"},
            format="json",
        )
        self.assertEqual(
            res.status_code, 200,
            f"correct credentials must sign the user in; got {res.status_code} {res.data}",
        )
        self.assertIn("access", res.data)

    def test_login_still_rejects_a_wrong_password(self):
        """The exemption must not have turned into a bypass."""
        res = self._with_dead_token().post(
            f"{API}/auth/login",
            {"username": "drwho", "password": "not-the-password"},
            format="json",
        )
        self.assertEqual(res.status_code, 401)
        self.assertNotIn("access", res.data)

    def test_refresh_succeeds_despite_an_expired_access_token(self):
        """This route exists to be called with a dead access token."""
        refresh = str(RefreshToken.for_user(self.doctor))
        res = self._with_dead_token().post(
            f"{API}/auth/refresh", {"refresh": refresh}, format="json"
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertIn("access", res.data)

    def test_signup_succeeds_despite_an_expired_token_in_the_header(self):
        res = self._with_dead_token().post(
            f"{API}/auth/signup",
            {
                "first_name": "Stale",
                "email": "stale.token@example.com",
                "phone": "9876500011",
                "password": "FreshPass123!",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.data)

    def test_a_protected_route_still_rejects_the_dead_token(self):
        """Only the auth routes are exempt; everything else must still refuse."""
        res = self._with_dead_token().get(f"{API}/pets")
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.data["detail"], "Your session has expired. Please sign in again.")
