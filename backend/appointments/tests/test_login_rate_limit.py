"""Login brute-force limit: failed sign-ins are counted per ACCOUNT.

Not per IP: behind Cloudflare -> Vercel every client shares the edge's
REMOTE_ADDR (see `_client_ip`), so a per-IP login limit would lock the whole
clinic out after one person's typos. Only failures count, so a user who signs
in correctly is never slowed down.
"""

from appointments.views.auth import LOGIN_FAIL_LIMIT

from .base import API, ApiTestCase


class LoginRateLimitTests(ApiTestCase):
    def _login(self, username, password):
        return self.anon().post(f"{API}/auth/login", {
            "username": username, "password": password}, format="json")

    def _fail(self, username, times):
        for _ in range(times):
            self.assertEqual(self._login(username, "wrong-password").status_code, 401)

    def test_account_is_blocked_after_limit_failures_even_with_right_password(self):
        self._fail("drwho", LOGIN_FAIL_LIMIT)
        r = self._login("drwho", "D0ctorPass!23")
        self.assertEqual(r.status_code, 429, r.content)
        self.assertNotIn("access", r.data)

    def test_failures_below_limit_do_not_block_and_success_resets(self):
        self._fail("drwho", LOGIN_FAIL_LIMIT - 1)
        self.assertEqual(self._login("drwho", "D0ctorPass!23").status_code, 200)
        # The counter was reset, so another near-limit run still allows sign-in.
        self._fail("drwho", LOGIN_FAIL_LIMIT - 1)
        self.assertEqual(self._login("drwho", "D0ctorPass!23").status_code, 200)

    def test_username_and_email_share_one_counter(self):
        """Alternating username and email must not double the guesses."""
        half = LOGIN_FAIL_LIMIT // 2
        self._fail("drwho", half)
        self._fail("DR@example.com", LOGIN_FAIL_LIMIT - half)
        self.assertEqual(self._login("drwho", "D0ctorPass!23").status_code, 429)

    def test_one_blocked_account_does_not_block_another(self):
        self._fail("drwho", LOGIN_FAIL_LIMIT)
        self.assertEqual(self._login("ownera", "OwnerAPass!23").status_code, 200)

    def test_unknown_usernames_are_limited_too(self):
        self._fail("nobody-here", LOGIN_FAIL_LIMIT)
        self.assertEqual(self._login("nobody-here", "anything").status_code, 429)
