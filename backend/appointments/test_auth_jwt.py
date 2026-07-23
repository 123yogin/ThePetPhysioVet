"""Auth-hardening acceptance-criteria suite (SRS §3.1 + §4).

Sprint 6 — JWT access/refresh, rotation + reuse detection (server-side
revocation via the token_blacklist app), and the bcrypt (cost>=12) password
upgrade path. This file proves the *acceptance criteria* wording of the auth
stories against the live ``/api/v1/auth`` contract; the sibling
``test_auth_hardening.py`` covers the foundation wiring. No production code is
touched here — tests only.

Run with:  ./.venv/bin/python manage.py test appointments.test_auth_jwt

Stories exercised:
  US-AUTH-01  login mints a signed JWT {user_id, role:'DOCTOR', exp} access
              token (TTL<=15min) + a refresh; the login body still carries the
              doctor's username/email/clinic_name at the top level; invalid
              creds -> 401 with NO tokens; logout revokes the refresh.
  US-AUTH-02  /auth/refresh rotates (new {access,refresh}); replaying the old
              refresh -> 401 (reuse detection); expired/garbage refresh -> 401.
  US-AUTH-04  new / password-changed hashes are bcrypt cost>=12; a legacy
              PBKDF2 hash is transparently re-hashed to bcrypt on next login;
              login accepts correct / rejects wrong password before and after
              the upgrade; no plaintext password is ever written to AuditLog.
"""

from datetime import timedelta

from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from .models import AuditLog
from .tests import PASSWORD, make_doctor

LOGIN = "/api/v1/auth/login"
REFRESH = "/api/v1/auth/refresh"
LOGOUT = "/api/v1/auth/logout"
ME = "/api/v1/auth/me"

# access-token TTL ceiling per SRS §3.1 (short-lived access token).
MAX_ACCESS_TTL_SECONDS = 15 * 60


def _login(client, username="drbob", password=PASSWORD, clinic="Clinic"):
    """Seed a doctor and log in through the JSON API; returns the response."""
    make_doctor(username, clinic=clinic)
    return client.post(
        LOGIN, {"username": username, "password": password}, format="json"
    )


def _bcrypt_cost(encoded):
    """Extract the numeric work factor from a Django bcrypt hash string.

    Django stores bcrypt as ``bcrypt_sha256$$2b$<cost>$<salt+hash>``; the cost
    is the field immediately after the ``2a``/``2b``/``2y`` variant marker.
    """
    parts = encoded.split("$")
    for i, part in enumerate(parts):
        if part in ("2a", "2b", "2y"):
            return int(parts[i + 1])
    raise AssertionError(f"no bcrypt cost found in {encoded!r}")


# ---------------------------------------------------------------------------
# US-AUTH-01 — login issues a signed JWT + carries the doctor profile
# ---------------------------------------------------------------------------
class LoginTokenContractTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_login_returns_signed_access_decodable_to_user_id_role_exp(self):
        resp = _login(self.client)
        self.assertEqual(resp.status_code, 200)
        self.assertIn("access", resp.data)
        self.assertIn("refresh", resp.data)
        self.assertTrue(resp.data["refresh"])

        user = User.objects.get(username="drbob")
        access = AccessToken(resp.data["access"])  # verifies the signature
        # decodable to {user_id, role:'DOCTOR', exp}. SimpleJWT serialises the
        # user-id claim as a string, so compare stringwise.
        self.assertEqual(str(access["user_id"]), str(user.id))
        self.assertEqual(access["role"], "DOCTOR")
        self.assertIn("exp", access.payload)

    def test_access_token_ttl_at_most_15_minutes(self):
        resp = _login(self.client)
        access = AccessToken(resp.data["access"])
        ttl = access.payload["exp"] - access.payload["iat"]
        self.assertLessEqual(ttl, MAX_ACCESS_TTL_SECONDS)
        self.assertGreater(ttl, 0)

    def test_login_body_carries_profile_fields_at_top_level(self):
        resp = _login(self.client, clinic="Happy Paws")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["username"], "drbob")
        self.assertEqual(resp.data["email"], "drbob@vet.test")
        self.assertEqual(resp.data["clinic_name"], "Happy Paws")

    def test_bearer_access_token_authenticates_me(self):
        # The minted access token, sent as a Bearer credential, authenticates
        # the doctor with no session at all.
        access = _login(self.client).data["access"]
        bearer = APIClient()
        bearer.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        me = bearer.get(ME)
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.data["username"], "drbob")

    def test_invalid_credentials_return_401_with_no_tokens(self):
        make_doctor("drbob")
        resp = self.client.post(
            LOGIN, {"username": "drbob", "password": "wrong-password"}, format="json"
        )
        self.assertEqual(resp.status_code, 401)
        self.assertNotIn("access", resp.data)
        self.assertNotIn("refresh", resp.data)


# ---------------------------------------------------------------------------
# US-AUTH-02 — refresh rotates with reuse detection
# ---------------------------------------------------------------------------
class RefreshRotationTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_refresh_returns_new_pair_and_replaying_old_is_401(self):
        old_refresh = _login(self.client).data["refresh"]

        rotated = self.client.post(REFRESH, {"refresh": old_refresh}, format="json")
        self.assertEqual(rotated.status_code, 200)
        self.assertTrue(rotated.data["access"])
        self.assertTrue(rotated.data["refresh"])
        self.assertNotEqual(rotated.data["refresh"], old_refresh)

        # Replaying the rotated-out refresh is rejected (blacklist reuse detection).
        replay = self.client.post(REFRESH, {"refresh": old_refresh}, format="json")
        self.assertEqual(replay.status_code, 401)

    def test_new_refresh_is_itself_usable_once(self):
        old_refresh = _login(self.client).data["refresh"]
        new_refresh = self.client.post(
            REFRESH, {"refresh": old_refresh}, format="json"
        ).data["refresh"]
        again = self.client.post(REFRESH, {"refresh": new_refresh}, format="json")
        self.assertEqual(again.status_code, 200)

    def test_garbage_refresh_is_401(self):
        make_doctor("drbob")
        resp = self.client.post(
            REFRESH, {"refresh": "not.a.jwt"}, format="json"
        )
        self.assertEqual(resp.status_code, 401)

    def test_expired_refresh_is_401(self):
        user = make_doctor("drbob")
        token = RefreshToken.for_user(user)
        token["role"] = "DOCTOR"
        token.set_exp(lifetime=timedelta(seconds=-1))  # already expired
        resp = self.client.post(REFRESH, {"refresh": str(token)}, format="json")
        self.assertEqual(resp.status_code, 401)


# ---------------------------------------------------------------------------
# US-AUTH-01 (logout) — logout revokes the refresh server-side
# ---------------------------------------------------------------------------
class LogoutRevocationTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_refresh_reuse_after_logout_is_401(self):
        refresh = _login(self.client).data["refresh"]
        out = self.client.post(LOGOUT, {"refresh": refresh}, format="json")
        self.assertEqual(out.status_code, 204)
        # The logged-out refresh can no longer be exchanged.
        reuse = self.client.post(REFRESH, {"refresh": refresh}, format="json")
        self.assertEqual(reuse.status_code, 401)


# ---------------------------------------------------------------------------
# US-AUTH-04 — bcrypt cost>=12 + transparent PBKDF2 upgrade on login
# ---------------------------------------------------------------------------
class BcryptUpgradeTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_new_password_hash_is_bcrypt_cost_at_least_12(self):
        user = User.objects.create_user(username="freshuser", password=PASSWORD)
        self.assertTrue(user.password.startswith("bcrypt"))
        self.assertGreaterEqual(_bcrypt_cost(user.password), 12)

    def test_password_change_rehashes_to_bcrypt_cost_at_least_12(self):
        user = make_doctor("drbob")
        user.set_password("NewRehab!2026xy")
        user.save(update_fields=["password"])
        self.assertTrue(user.password.startswith("bcrypt"))
        self.assertGreaterEqual(_bcrypt_cost(user.password), 12)

    def test_pbkdf2_hash_upgrades_to_bcrypt_on_next_successful_login(self):
        user = make_doctor("legacy")
        # Seed a legacy PBKDF2 hash (pre-hardening storage).
        user.password = make_password(PASSWORD, hasher="pbkdf2_sha256")
        user.save(update_fields=["password"])
        self.assertTrue(user.password.startswith("pbkdf2"))

        # Wrong password is rejected while still stored as PBKDF2.
        before_wrong = self.client.post(
            LOGIN, {"username": "legacy", "password": "wrong"}, format="json"
        )
        self.assertEqual(before_wrong.status_code, 401)

        # Correct password logs in AND flips the stored hash to bcrypt.
        before_ok = self.client.post(
            LOGIN, {"username": "legacy", "password": PASSWORD}, format="json"
        )
        self.assertEqual(before_ok.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.password.startswith("bcrypt"))
        self.assertGreaterEqual(_bcrypt_cost(user.password), 12)

        # After the upgrade: correct still accepted, wrong still rejected.
        after_ok = self.client.post(
            LOGIN, {"username": "legacy", "password": PASSWORD}, format="json"
        )
        self.assertEqual(after_ok.status_code, 200)
        after_wrong = self.client.post(
            LOGIN, {"username": "legacy", "password": "wrong"}, format="json"
        )
        self.assertEqual(after_wrong.status_code, 401)

    def test_no_plaintext_password_in_any_audit_log_row(self):
        # Drive both a successful and a failed login (both are audited), then
        # assert the raw password never landed in any stored AuditLog field.
        make_doctor("drbob")
        self.client.post(
            LOGIN, {"username": "drbob", "password": PASSWORD}, format="json"
        )
        self.client.post(
            LOGIN, {"username": "drbob", "password": "wrong"}, format="json"
        )
        self.assertTrue(AuditLog.objects.exists())  # logins were recorded
        for row in AuditLog.objects.all():
            for value in (
                row.action, row.entity_type, row.entity_id or "",
                row.method, row.path, str(row.status_code), str(row),
            ):
                self.assertNotIn(PASSWORD, value)
                self.assertNotIn("wrong", value)
