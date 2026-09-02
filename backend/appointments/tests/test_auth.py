"""Authentication regressions that must never return.

API_CONTRACT.md §3 Auth: "/auth/login MUST call authenticate() and return 401
on bad credentials. No username-only lookup. No role fallback. No anonymous
default user anywhere in the codebase."
"""

from django.test import override_settings

from appointments.models import UserProfile

from .base import API, FAST_HASHERS, ApiTestCase


class LoginTests(ApiTestCase):
    def test_correct_credentials_return_tokens_and_user(self):
        r = self.anon().post(f"{API}/auth/login", {
            "username": "drwho", "password": "D0ctorPass!23"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn("access", r.data)
        self.assertIn("refresh", r.data)
        self.assertEqual(r.data["role"], "DOCTOR")
        self.assertNotIn("password", r.data)

    def test_bad_password_returns_401(self):
        r = self.anon().post(f"{API}/auth/login", {
            "username": "drwho", "password": "wrong-password"}, format="json")
        self.assertEqual(r.status_code, 401, r.content)
        self.assertNotIn("access", r.data)

    def test_unknown_username_returns_401_with_no_role_fallback(self):
        r = self.anon().post(f"{API}/auth/login", {
            "username": "does-not-exist", "password": "anything"}, format="json")
        self.assertEqual(r.status_code, 401, r.content)
        self.assertNotIn("access", r.data)

    def test_empty_password_returns_4xx_never_a_token(self):
        r = self.anon().post(f"{API}/auth/login", {
            "username": "drwho", "password": ""}, format="json")
        self.assertIn(r.status_code, (400, 401), r.content)
        self.assertNotIn("access", r.data)

    def test_role_in_body_cannot_override_the_real_role(self):
        """A client claiming role=DOCTOR must not be granted DOCTOR."""
        r = self.anon().post(f"{API}/auth/login", {
            "username": "ownera", "password": "OwnerAPass!23",
            "role": "DOCTOR"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["role"], "OWNER")

    def test_inactive_user_cannot_login(self):
        self.owner_a.is_active = False
        self.owner_a.save()
        r = self.anon().post(f"{API}/auth/login", {
            "username": "ownera", "password": "OwnerAPass!23"}, format="json")
        self.assertEqual(r.status_code, 401, r.content)

    def test_deactivated_user_existing_token_is_rejected(self):
        self.auth(self.owner_a)
        self.owner_a.is_active = False
        self.owner_a.save()
        r = self.client.get(f"{API}/auth/me")
        self.assertEqual(r.status_code, 401, r.content)


class AnonymousAccessTests(ApiTestCase):
    """No anonymous fallback user anywhere (API_CONTRACT.md §4.4)."""

    def test_anonymous_auth_me_is_401(self):
        r = self.anon().get(f"{API}/auth/me")
        self.assertEqual(r.status_code, 401, r.content)

    def test_anonymous_profile_patch_is_401(self):
        r = self.anon().patch(f"{API}/auth/profile", {"clinic_name": "Pwned"},
                              format="json")
        self.assertEqual(r.status_code, 401, r.content)
        self.assertFalse(
            UserProfile.objects.filter(clinic_name="Pwned").exists(),
            "anonymous PATCH mutated a profile",
        )

    def test_anonymous_collections_are_401(self):
        for path in ("/pets", "/appointments", "/invoices", "/dashboard/stats",
                     "/revenue", "/notifications", "/queries/inbox",
                     "/owner/pets", "/owner/appointments", "/owner/invoices"):
            with self.subTest(path=path):
                r = self.anon().get(f"{API}{path}")
                self.assertEqual(r.status_code, 401, f"{path} -> {r.status_code}")

    def test_anonymous_detail_routes_are_401_not_404(self):
        for path in (f"/pets/{self.pet_a.id}",
                     f"/appointments/{self.appt_a.id}",
                     f"/invoices/{self.invoice_a.id}",
                     f"/treatment-plans/{self.plan_a.id}",
                     f"/pets/{self.pet_a.id}/queries"):
            with self.subTest(path=path):
                r = self.anon().get(f"{API}{path}")
                self.assertEqual(r.status_code, 401, f"{path} -> {r.status_code}")

    def test_anonymous_mutations_are_401(self):
        cases = [
            ("post", f"/pets", {"name": "x", "owner_name": "y", "owner_phone": "1"}),
            ("post", f"/appointments/{self.appt_a.id}/complete", {}),
            ("post", f"/invoices/{self.invoice_a.id}/payments", {"amount_paid": 1}),
            ("post", f"/notifications/mark-all-read", {}),
        ]
        for method, path, body in cases:
            with self.subTest(path=path):
                r = getattr(self.anon(), method)(f"{API}{path}", body, format="json")
                self.assertEqual(r.status_code, 401, f"{path} -> {r.status_code}")

    def test_no_anonymous_doctor_fallback_in_source(self):
        """Regression guard for the deleted `filter(role="DOCTOR").first()` default.

        QA round 3: a sibling test was found VACUOUS because
        `inspect.getsource()` on an @api_view-decorated view returns DRF's
        443-char wrapper, not the view body (`.__wrapped__` gives the same
        wrapper — it is not a workaround). This test greps the MODULE, which
        is not affected; the positive controls below prove the haystack is
        real, so this can never silently pass against empty/wrapper source.
        """
        import inspect
        from appointments import views
        src = inspect.getsource(views)

        # Positive controls: if these ever fail, the grep target is wrong and
        # the negative assertions below are meaningless.
        self.assertGreater(len(src), 10000, "module source looks truncated")
        self.assertIn("def refresh_view(request):", src)
        self.assertIn("def login_view(request):", src)

        self.assertNotIn('role="DOCTOR").first()', src)
        self.assertNotIn("role='DOCTOR').first()", src)

    def test_source_grep_guard_is_not_vacuous(self):
        """Meta-test: prove getsource(module) really can fail."""
        import inspect
        from appointments import views
        src = inspect.getsource(views)
        self.assertNotIn("a-string-that-is-definitely-not-in-views-py", src)
        self.assertIn("authenticate(", src)  # the thing we care about IS there


class SignupTests(ApiTestCase):
    def test_signup_creates_hashed_password_and_returns_tokens(self):
        r = self.anon().post(f"{API}/auth/signup", {
            "username": "newowner", "password": "S3curePass!", "email": "n@e.com",
            "first_name": "New", "last_name": "Owner", "role": "OWNER",
            "phone": "9998887777"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        user = UserProfile.objects.get(username="newowner")
        self.assertNotEqual(user.password, "S3curePass!")
        self.assertTrue(user.check_password("S3curePass!"))
        self.assertNotIn("password", r.data)

    @override_settings(PASSWORD_HASHERS=[
        "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
        "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    ])
    def test_password_hashed_with_bcrypt_cost_at_least_12(self):
        """API_CONTRACT.md §5: bcrypt, cost >= 12, first in PASSWORD_HASHERS."""
        r = self.anon().post(f"{API}/auth/signup", {
            "username": "bcryptuser", "password": "S3curePass!", "email": "b@e.com",
            "first_name": "B", "last_name": "C", "role": "OWNER"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        user = UserProfile.objects.get(username="bcryptuser")
        self.assertTrue(user.password.startswith("bcrypt_sha256$"), user.password[:30])
        cost = int(user.password.split("$")[3])
        self.assertGreaterEqual(cost, 12, f"bcrypt cost {cost} < 12")

    def test_settings_declare_bcrypt_first_with_cost_12(self):
        """Read the settings MODULE, not django.conf (this suite overrides
        PASSWORD_HASHERS with a fast hasher for speed)."""
        from django.contrib.auth.hashers import BCryptSHA256PasswordHasher
        from petphysio import settings as raw
        self.assertIn("bcrypt", raw.PASSWORD_HASHERS[0].lower(),
                      raw.PASSWORD_HASHERS)
        self.assertGreaterEqual(BCryptSHA256PasswordHasher().rounds, 12)

    def test_signup_rejects_invalid_role(self):
        r = self.anon().post(f"{API}/auth/signup", {
            "username": "hacker", "password": "S3curePass!", "email": "h@e.com",
            "first_name": "H", "last_name": "K", "role": "ADMIN"}, format="json")
        self.assertEqual(r.status_code, 400, r.content)

    def test_signup_cannot_set_is_staff_or_is_superuser(self):
        r = self.anon().post(f"{API}/auth/signup", {
            "username": "escalate", "password": "S3curePass!", "email": "e@e.com",
            "first_name": "E", "last_name": "S", "role": "OWNER",
            "is_staff": True, "is_superuser": True}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        user = UserProfile.objects.get(username="escalate")
        self.assertFalse(user.is_staff, "mass-assignment set is_staff")
        self.assertFalse(user.is_superuser, "mass-assignment set is_superuser")

    def test_duplicate_username_rejected(self):
        r = self.anon().post(f"{API}/auth/signup", {
            "username": "drwho", "password": "S3curePass!", "email": "x@e.com",
            "first_name": "X", "last_name": "Y", "role": "OWNER"}, format="json")
        self.assertEqual(r.status_code, 400, r.content)

    def test_duplicate_email_rejected(self):
        """Known-issue checklist: email uniqueness must be enforced."""
        r = self.anon().post(f"{API}/auth/signup", {
            "username": "another", "password": "S3curePass!",
            "email": "dr@example.com", "first_name": "A", "last_name": "N",
            "role": "OWNER"}, format="json")
        self.assertEqual(
            r.status_code, 400,
            "duplicate email accepted -> two accounts share an email "
            "(breaks password-reset / account recovery)",
        )


class ProfileTests(ApiTestCase):
    def test_owner_can_update_own_safe_fields(self):
        self.auth(self.owner_a)
        r = self.client.patch(f"{API}/auth/profile", {"first_name": "Alicia"},
                              format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.owner_a.refresh_from_db()
        self.assertEqual(self.owner_a.first_name, "Alicia")

    def test_owner_cannot_escalate_role_to_doctor_via_profile_patch(self):
        """Mass assignment: `role` must be read-only on PATCH /auth/profile.

        If this passes for an attacker, an OWNER becomes a DOCTOR and gains
        read access to every pet, invoice and PII record in the clinic.
        """
        self.auth(self.owner_a)
        r = self.client.patch(f"{API}/auth/profile", {"role": "DOCTOR"},
                              format="json")
        self.owner_a.refresh_from_db()
        self.assertEqual(
            self.owner_a.role, "OWNER",
            f"ROLE ESCALATION: PATCH /auth/profile set role=DOCTOR "
            f"(HTTP {r.status_code})",
        )

    def test_profile_patch_cannot_set_is_staff(self):
        self.auth(self.owner_a)
        self.client.patch(f"{API}/auth/profile", {"is_staff": True}, format="json")
        self.owner_a.refresh_from_db()
        self.assertFalse(self.owner_a.is_staff)

    def test_profile_patch_cannot_set_password_directly(self):
        self.auth(self.owner_a)
        self.client.patch(f"{API}/auth/profile", {"password": "plaintext"},
                          format="json")
        self.owner_a.refresh_from_db()
        self.assertNotEqual(self.owner_a.password, "plaintext")


class LogoutTests(ApiTestCase):
    def test_logout_blacklists_the_refresh_token(self):
        r = self.anon().post(f"{API}/auth/login", {
            "username": "drwho", "password": "D0ctorPass!23"}, format="json")
        refresh = r.data["refresh"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        out = self.client.post(f"{API}/auth/logout", {"refresh": refresh},
                               format="json")
        self.assertEqual(out.status_code, 204, out.content)

        from rest_framework_simplejwt.tokens import RefreshToken
        from rest_framework_simplejwt.exceptions import TokenError
        with self.assertRaises(TokenError):
            RefreshToken(refresh).check_blacklist()

    def test_logout_without_refresh_body_is_rejected(self):
        """The SPA calls POST /auth/logout with NO body (frontend/src/api/auth.ts:33).

        Documents the actual behaviour so the contract drift is visible.
        """
        self.auth(self.doctor)
        r = self.client.post(f"{API}/auth/logout", {}, format="json")
        self.assertEqual(
            r.status_code, 204,
            "SPA logout sends no `refresh`; backend rejects it, so the refresh "
            "token is never blacklisted server-side",
        )
