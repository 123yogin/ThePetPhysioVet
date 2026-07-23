"""Tests for the Sprint 6 auth-hardening backend foundation (SRS §3.1 + §4).

Run with:  ./.venv/bin/python manage.py test appointments.test_auth_hardening

Covers: JWT access-token auth + Bearer challenge, RBAC via the DOCTOR role
claim, rotating refresh with server-side revocation (logout + reuse detection),
bcrypt (cost>=12) hashing with transparent PBKDF2->bcrypt upgrade on login, and
the AuditLog trail written by AuditMiddleware / record_event.
"""

from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from .models import AuditLog, Pet
from .tests import PASSWORD, make_doctor


def _login(client, username=None, password=PASSWORD, user="drbob"):
    make_doctor(user)
    resp = client.post(
        "/api/v1/auth/login",
        {"username": username or user, "password": password},
        format="json",
    )
    return resp


class JWTAuthTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_login_returns_access_and_refresh(self):
        resp = _login(self.client)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["access"])
        self.assertTrue(resp.data["refresh"])

    def test_bearer_access_token_authenticates_me(self):
        resp = _login(self.client)
        access = resp.data["access"]
        fresh = APIClient()  # no session — Bearer only
        fresh.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        me = fresh.get("/api/v1/auth/me")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.data["username"], "drbob")

    def test_no_token_returns_401(self):
        make_doctor("drbob")
        self.assertEqual(APIClient().get("/api/v1/auth/me").status_code, 401)

    def test_invalid_token_returns_401(self):
        make_doctor("drbob")
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION="Bearer not-a-real-token")
        self.assertEqual(c.get("/api/v1/auth/me").status_code, 401)

    def test_valid_non_doctor_role_token_returns_403(self):
        # A verified token WITHOUT role=DOCTOR must be rejected by IsVet (403).
        user = make_doctor("drbob")
        access = str(AccessToken.for_user(user))  # no 'role' claim
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        self.assertEqual(c.get("/api/v1/auth/me").status_code, 403)

    def test_login_token_carries_doctor_role(self):
        resp = _login(self.client)
        access = AccessToken(resp.data["access"])
        self.assertEqual(access["role"], "DOCTOR")


class RefreshRotationTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_refresh_rotates_and_old_token_is_revoked(self):
        resp = _login(self.client)
        old_refresh = resp.data["refresh"]
        r1 = self.client.post("/api/v1/auth/refresh", {"refresh": old_refresh}, format="json")
        self.assertEqual(r1.status_code, 200)
        self.assertTrue(r1.data["access"])
        self.assertTrue(r1.data["refresh"])
        self.assertNotEqual(r1.data["refresh"], old_refresh)
        # Reusing the rotated-out refresh is rejected (reuse detection).
        reuse = self.client.post("/api/v1/auth/refresh", {"refresh": old_refresh}, format="json")
        self.assertEqual(reuse.status_code, 401)

    def test_rotated_access_keeps_doctor_role(self):
        resp = _login(self.client)
        r1 = self.client.post(
            "/api/v1/auth/refresh", {"refresh": resp.data["refresh"]}, format="json"
        )
        self.assertEqual(AccessToken(r1.data["access"])["role"], "DOCTOR")

    def test_logout_blacklists_refresh(self):
        resp = _login(self.client)
        refresh = resp.data["refresh"]
        out = self.client.post("/api/v1/auth/logout", {"refresh": refresh}, format="json")
        self.assertEqual(out.status_code, 204)
        # A blacklisted refresh can no longer be exchanged.
        after = self.client.post("/api/v1/auth/refresh", {"refresh": refresh}, format="json")
        self.assertEqual(after.status_code, 401)

    def test_logout_without_refresh_still_204(self):
        make_doctor("drbob")
        self.client.login(username="drbob", password=PASSWORD)
        self.assertEqual(self.client.post("/api/v1/auth/logout").status_code, 204)


class BcryptHashingTests(TestCase):
    def test_new_password_stored_as_bcrypt_cost_12(self):
        user = User.objects.create_user(username="hashme", password=PASSWORD)
        self.assertTrue(user.password.startswith("bcrypt_sha256$"))
        # bcrypt encodes the cost between the $2b$ marker and the salt.
        self.assertIn("$12$", user.password)

    def test_legacy_pbkdf2_hash_upgrades_to_bcrypt_on_login(self):
        user = make_doctor("legacy")
        user.password = make_password(PASSWORD, hasher="pbkdf2_sha256")
        user.save(update_fields=["password"])
        self.assertTrue(user.password.startswith("pbkdf2_"))
        resp = APIClient().post(
            "/api/v1/auth/login",
            {"username": "legacy", "password": PASSWORD},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.password.startswith("bcrypt_sha256$"))


class AuditLogTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.doc = make_doctor("drbob")

    def test_create_writes_audit_row_with_user(self):
        self.client.login(username="drbob", password=PASSWORD)
        AuditLog.objects.all().delete()  # start clean (client.login bypasses the API)
        resp = self.client.post(
            "/api/v1/pets",
            {"name": "Bruno", "pet_type": "Dog", "owner_name": "Asha",
             "owner_phone": "+919876543210"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        log = AuditLog.objects.filter(action=AuditLog.CREATE, entity_type="pets").latest("created_at")
        self.assertEqual(log.user_id, self.doc.id)
        self.assertEqual(log.method, "POST")
        self.assertEqual(log.status_code, 201)
        self.assertIsNotNone(log.created_at)

    def test_get_writes_no_audit_row(self):
        self.client.login(username="drbob", password=PASSWORD)
        AuditLog.objects.all().delete()
        self.client.get("/api/v1/pets")
        self.assertEqual(AuditLog.objects.count(), 0)

    def test_method_action_and_path_parsing(self):
        # Unit-level checks of the middleware's method->action map and the
        # entity_type/entity_id path parser (drives every CREATE/UPDATE/DELETE).
        from .audit import _METHOD_ACTION, _parse_entity
        self.assertEqual(_METHOD_ACTION["POST"], "CREATE")
        self.assertEqual(_METHOD_ACTION["PUT"], "UPDATE")
        self.assertEqual(_METHOD_ACTION["PATCH"], "UPDATE")
        self.assertEqual(_METHOD_ACTION["DELETE"], "DELETE")
        self.assertEqual(_parse_entity("/api/v1/pets"), ("pets", None))
        self.assertEqual(_parse_entity("/api/v1/pets/5"), ("pets", "5"))
        self.assertEqual(_parse_entity("/api/v1/pets/5/diagnoses"), ("pets", "5"))
        self.assertEqual(_parse_entity("/api/v1/diagnoses/7/file"), ("diagnoses", "7"))

    def test_login_and_failed_login_are_audited(self):
        AuditLog.objects.all().delete()
        ok = self.client.post(
            "/api/v1/auth/login", {"username": "drbob", "password": PASSWORD}, format="json"
        )
        self.assertEqual(ok.status_code, 200)
        self.assertTrue(AuditLog.objects.filter(action=AuditLog.LOGIN, user=self.doc).exists())

        bad = self.client.post(
            "/api/v1/auth/login", {"username": "drbob", "password": "wrong"}, format="json"
        )
        self.assertEqual(bad.status_code, 401)
        failed = AuditLog.objects.filter(action=AuditLog.LOGIN_FAILED).latest("created_at")
        self.assertIsNone(failed.user_id)  # no user attributed to a failed login

    def test_auth_paths_not_double_logged_as_create(self):
        AuditLog.objects.all().delete()
        self.client.post(
            "/api/v1/auth/login", {"username": "drbob", "password": PASSWORD}, format="json"
        )
        # The login POST must NOT also produce a generic CREATE row.
        self.assertFalse(AuditLog.objects.filter(action=AuditLog.CREATE).exists())
