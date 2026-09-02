"""Coverage for POST /auth/password-reset/{request,confirm}.

API_CONTRACT.md §3 Auth (AMENDED — password reset added) / §4.1 (AllowAny
widened to five routes). See appointments/views.py for the endpoints and
appointments/models.py `PasswordResetToken` for the token design.
"""

import re
from datetime import timedelta

from django.core import mail
from django.core.cache import cache
from django.utils import timezone

from appointments.models import PasswordResetToken, UserProfile

from .base import API, ApiTestCase

TOKEN_RE = re.compile(r"token=([^\s&]+)")


class PasswordResetRequestTests(ApiTestCase):
    def test_known_email_returns_200_and_creates_a_token_row(self):
        self.assertEqual(PasswordResetToken.objects.filter(user=self.owner_a).count(), 0)
        r = self.anon().post(
            f"{API}/auth/password-reset/request", {"email": "a@example.com"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(PasswordResetToken.objects.filter(user=self.owner_a).count(), 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(self.owner_a.email, mail.outbox[0].to)

    def test_unknown_email_returns_200_with_identical_body_and_creates_nothing(self):
        r_known = self.anon().post(
            f"{API}/auth/password-reset/request", {"email": "a@example.com"}, format="json")
        cache.clear()  # isolate from the rate limiter, not from the assertion under test
        r_unknown = self.anon().post(
            f"{API}/auth/password-reset/request",
            {"email": "nobody-here@example.com"}, format="json")

        self.assertEqual(r_unknown.status_code, 200, r_unknown.content)
        self.assertEqual(r_known.status_code, r_unknown.status_code)
        self.assertEqual(r_known.data, r_unknown.data,
                          "known vs unknown email must return an identical body "
                          "(user-enumeration oracle)")
        self.assertEqual(PasswordResetToken.objects.count(), 1,  # only the known-email one
                          "an unknown email must not create a token row")
        self.assertEqual(len(mail.outbox), 1, "an unknown email must not send an email")

    def test_missing_email_is_400(self):
        r = self.anon().post(f"{API}/auth/password-reset/request", {}, format="json")
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn("detail", r.data)

    def test_inactive_user_treated_like_unknown_email(self):
        self.owner_a.is_active = False
        self.owner_a.save()
        r = self.anon().post(
            f"{API}/auth/password-reset/request", {"email": "a@example.com"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(PasswordResetToken.objects.count(), 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_second_request_invalidates_the_first_token(self):
        self.anon().post(
            f"{API}/auth/password-reset/request", {"email": "a@example.com"}, format="json")
        first_token = TOKEN_RE.search(mail.outbox[0].body).group(1)

        self.anon().post(
            f"{API}/auth/password-reset/request", {"email": "a@example.com"}, format="json")
        second_token = TOKEN_RE.search(mail.outbox[1].body).group(1)

        self.assertNotEqual(first_token, second_token)

        r_first = self.anon().post(f"{API}/auth/password-reset/confirm",
                                   {"token": first_token, "new_password": "BrandNewPass9!"},
                                   format="json")
        self.assertEqual(r_first.status_code, 400, r_first.content)
        self.assertIn("detail", r_first.data)

        r_second = self.anon().post(f"{API}/auth/password-reset/confirm",
                                    {"token": second_token, "new_password": "BrandNewPass9!"},
                                    format="json")
        self.assertEqual(r_second.status_code, 200, r_second.content)

    def test_rate_limiting_triggers_on_repeated_requests_for_one_email(self):
        statuses = []
        for _ in range(7):
            r = self.anon().post(
                f"{API}/auth/password-reset/request", {"email": "a@example.com"}, format="json")
            statuses.append(r.status_code)
        self.assertIn(429, statuses,
                      f"expected a 429 among repeated requests, got {statuses}")
        # Everything up to the limit must still look identical to any other
        # 200 (never a different shape once rate-limited).
        first_429_index = statuses.index(429)
        self.assertTrue(all(s == 200 for s in statuses[:first_429_index]))

    def test_raw_token_is_never_stored_in_the_database(self):
        self.anon().post(
            f"{API}/auth/password-reset/request", {"email": "a@example.com"}, format="json")
        raw_token = TOKEN_RE.search(mail.outbox[0].body).group(1)

        row = PasswordResetToken.objects.get(user=self.owner_a)
        self.assertNotEqual(row.token_hash, raw_token)
        self.assertNotIn(raw_token, row.token_hash)
        # The hash is exactly a 64-char hex SHA-256 digest, not the token
        # itself (which is base64url and a different length/alphabet).
        self.assertEqual(len(row.token_hash), 64)
        self.assertTrue(all(c in "0123456789abcdef" for c in row.token_hash))


class PasswordResetConfirmTests(ApiTestCase):
    def _request_token(self, email="a@example.com"):
        self.anon().post(f"{API}/auth/password-reset/request", {"email": email}, format="json")
        return TOKEN_RE.search(mail.outbox[-1].body).group(1)

    def test_valid_token_changes_password_and_can_log_in_with_it(self):
        raw_token = self._request_token()
        r = self.anon().post(f"{API}/auth/password-reset/confirm",
                             {"token": raw_token, "new_password": "BrandNewPass9!"},
                             format="json")
        self.assertEqual(r.status_code, 200, r.content)

        old = self.anon().post(f"{API}/auth/login",
                               {"username": "ownera", "password": "OwnerAPass!23"}, format="json")
        self.assertEqual(old.status_code, 401, old.content)

        new = self.anon().post(f"{API}/auth/login",
                               {"username": "ownera", "password": "BrandNewPass9!"}, format="json")
        self.assertEqual(new.status_code, 200, new.content)

    def test_garbage_token_is_400_with_detail(self):
        r = self.anon().post(f"{API}/auth/password-reset/confirm",
                             {"token": "totally-made-up-token", "new_password": "BrandNewPass9!"},
                             format="json")
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn("detail", r.data)
        self.assertTrue(r.data["detail"])

    def test_expired_token_is_400(self):
        raw_token = self._request_token()
        row = PasswordResetToken.objects.get(user=self.owner_a)
        row.expires_at = timezone.now() - timedelta(minutes=1)
        row.save(update_fields=["expires_at"])

        r = self.anon().post(f"{API}/auth/password-reset/confirm",
                             {"token": raw_token, "new_password": "BrandNewPass9!"},
                             format="json")
        self.assertEqual(r.status_code, 400, r.content)
        self.owner_a.refresh_from_db()
        self.assertTrue(self.owner_a.check_password("OwnerAPass!23"),
                        "an expired token must not change the password")

    def test_already_used_token_is_400_on_second_use(self):
        raw_token = self._request_token()
        r1 = self.anon().post(f"{API}/auth/password-reset/confirm",
                              {"token": raw_token, "new_password": "BrandNewPass9!"},
                              format="json")
        self.assertEqual(r1.status_code, 200, r1.content)

        r2 = self.anon().post(f"{API}/auth/password-reset/confirm",
                              {"token": raw_token, "new_password": "AnotherPass8!"},
                              format="json")
        self.assertEqual(r2.status_code, 400, r2.content)

    def test_weak_password_is_400(self):
        raw_token = self._request_token()
        r = self.anon().post(f"{API}/auth/password-reset/confirm",
                             {"token": raw_token, "new_password": "abc"},
                             format="json")
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn("detail", r.data)

    def test_missing_fields_is_400(self):
        r = self.anon().post(f"{API}/auth/password-reset/confirm", {}, format="json")
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn("detail", r.data)

    def test_reset_blacklists_all_outstanding_refresh_tokens_for_the_user(self):
        login = self.anon().post(f"{API}/auth/login",
                                 {"username": "ownera", "password": "OwnerAPass!23"}, format="json")
        self.assertEqual(login.status_code, 200, login.content)
        old_refresh = login.data["refresh"]

        raw_token = self._request_token()
        r = self.anon().post(f"{API}/auth/password-reset/confirm",
                             {"token": raw_token, "new_password": "BrandNewPass9!"},
                             format="json")
        self.assertEqual(r.status_code, 200, r.content)

        refreshed = self.anon().post(f"{API}/auth/refresh", {"refresh": old_refresh}, format="json")
        self.assertEqual(refreshed.status_code, 401, refreshed.content)

    def test_reset_does_not_affect_another_users_sessions(self):
        login_b = self.anon().post(f"{API}/auth/login",
                                   {"username": "ownerb", "password": "OwnerBPass!23"}, format="json")
        self.assertEqual(login_b.status_code, 200, login_b.content)
        b_refresh = login_b.data["refresh"]

        raw_token = self._request_token(email="a@example.com")
        self.anon().post(f"{API}/auth/password-reset/confirm",
                         {"token": raw_token, "new_password": "BrandNewPass9!"}, format="json")

        refreshed_b = self.anon().post(f"{API}/auth/refresh", {"refresh": b_refresh}, format="json")
        self.assertEqual(refreshed_b.status_code, 200, refreshed_b.content)
