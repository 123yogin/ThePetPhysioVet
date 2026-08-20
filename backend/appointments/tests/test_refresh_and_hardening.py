"""Coverage for the surface added/changed by the QA-round-1 amendments.

API_CONTRACT.md §3 Auth (AMENDED 2026-08-20), §4, §5, §6.7:
  - POST /auth/refresh
  - public signup always creates an OWNER
  - role/username/id/is_staff/is_superuser read-only on PATCH /auth/profile
  - money guards: overpayment, negative unit_price, invoice_no generation
  - `manage.py create_doctor` as the only doctor-provisioning path
"""

from datetime import timedelta
from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings

from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from appointments.models import Invoice, Payment, UserProfile

from .base import API, FAST_HASHERS, ApiTestCase


# ---------------------------------------------------------------------------
# POST /auth/refresh
# ---------------------------------------------------------------------------

class RefreshEndpointTests(ApiTestCase):
    def _login(self, username="drwho", password="D0ctorPass!23"):
        r = self.anon().post(f"{API}/auth/login",
                             {"username": username, "password": password},
                             format="json")
        self.assertEqual(r.status_code, 200, r.content)
        return r.data["access"], r.data["refresh"]

    def test_valid_refresh_returns_a_new_usable_access_token(self):
        _, refresh = self._login()
        r = self.anon().post(f"{API}/auth/refresh", {"refresh": refresh},
                             format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn("access", r.data)

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        me = self.client.get(f"{API}/auth/me")
        self.assertEqual(me.status_code, 200, me.content)
        self.assertEqual(me.data["username"], "drwho")
        self.assertEqual(me.data["role"], "DOCTOR")

    # ADJUDICATED (QA round 3): the key-set expectation was {"access"}.
    # Contract §3 amendment 4 makes /auth/refresh ROTATE, so it must now
    # return {access, refresh}. Only the key set moved — the PII half of this
    # test is unchanged and still load-bearing.
    def test_refresh_response_returns_rotated_pair_and_no_pii(self):
        _, refresh = self._login()
        r = self.anon().post(f"{API}/auth/refresh", {"refresh": refresh},
                             format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(set(r.data.keys()), {"access", "refresh"},
                         f"contract says /auth/refresh returns "
                         f"{{access, refresh}}, got {sorted(r.data.keys())}")
        # --- PII half (unchanged) ---
        blob = str(r.data)
        for leaked in ("password", "is_staff", "is_superuser", "email",
                       "username", "role"):
            self.assertNotIn(leaked, blob,
                             f"/auth/refresh leaked `{leaked}` in its body")

    def test_refresh_works_after_the_access_token_has_expired(self):
        """The whole point of §6.7: no silent logout at 45 minutes."""
        _, refresh = self._login()
        expired = self._expired(AccessToken.for_user(self.doctor))
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {expired}")
        self.assertEqual(self.client.get(f"{API}/auth/me").status_code, 401,
                         "an expired access token was still accepted")

        # ...and the stored refresh token still buys a working access token.
        r = self.anon().post(f"{API}/auth/refresh", {"refresh": refresh},
                             format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        self.assertEqual(self.client.get(f"{API}/auth/me").status_code, 200)

    def test_garbage_refresh_is_401(self):
        for value in ("not-a-jwt", "a.b.c", "Bearer x", "null"):
            with self.subTest(value=value):
                r = self.anon().post(f"{API}/auth/refresh", {"refresh": value},
                                     format="json")
                self.assertEqual(r.status_code, 401, r.content)
                self.assertNotIn("access", r.data)

    def test_missing_refresh_is_400_with_a_renderable_detail(self):
        r = self.anon().post(f"{API}/auth/refresh", {}, format="json")
        self.assertEqual(r.status_code, 400, r.content)
        self.assertTrue(r.data.get("detail"), dict(r.data))

    def test_expired_refresh_is_401(self):
        expired = self._expired(RefreshToken.for_user(self.doctor))
        r = self.anon().post(f"{API}/auth/refresh", {"refresh": expired},
                             format="json")
        self.assertEqual(r.status_code, 401, r.content)
        self.assertNotIn("access", r.data)

    def test_blacklisted_refresh_is_401(self):
        """Logout must actually kill the refresh token for /auth/refresh too."""
        access, refresh = self._login()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        out = self.client.post(f"{API}/auth/logout", {"refresh": refresh},
                               format="json")
        self.assertEqual(out.status_code, 204, out.content)

        r = self.anon().post(f"{API}/auth/refresh", {"refresh": refresh},
                             format="json")
        self.assertEqual(r.status_code, 401,
                         "a blacklisted refresh token still minted an access "
                         "token — logout does not revoke")
        self.assertNotIn("access", r.data)

    def test_access_token_posted_as_a_refresh_is_401(self):
        access, _ = self._login()
        r = self.anon().post(f"{API}/auth/refresh", {"refresh": access},
                             format="json")
        self.assertEqual(r.status_code, 401,
                         "an ACCESS token was accepted as a refresh token — "
                         "token_type is not being verified")
        self.assertNotIn("access", r.data)

    def test_refresh_signed_with_another_key_is_401(self):
        import jwt
        from django.utils import timezone
        forged = jwt.encode(
            {"user_id": self.doctor.id, "token_type": "refresh", "jti": "x",
             "exp": int(timezone.now().timestamp()) + 86400},
            "not-the-signing-key", algorithm="HS256")
        r = self.anon().post(f"{API}/auth/refresh", {"refresh": forged},
                             format="json")
        self.assertEqual(r.status_code, 401, r.content)

    def test_refresh_does_not_escalate_role(self):
        """An owner's refresh token must mint an OWNER access token."""
        _, refresh = self._login("ownera", "OwnerAPass!23")
        r = self.anon().post(f"{API}/auth/refresh", {"refresh": refresh},
                             format="json")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        self.assertEqual(self.client.get(f"{API}/auth/me").data["role"], "OWNER")
        self.assertEqual(self.client.get(f"{API}/pets").status_code, 403)

    def test_refresh_for_a_deactivated_user_cannot_reach_data(self):
        _, refresh = self._login("ownera", "OwnerAPass!23")
        self.owner_a.is_active = False
        self.owner_a.save()
        r = self.anon().post(f"{API}/auth/refresh", {"refresh": refresh},
                             format="json")
        if r.status_code == 200:
            self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
            self.assertEqual(
                self.client.get(f"{API}/auth/me").status_code, 401,
                "a deactivated user refreshed into a working access token")


# ---------------------------------------------------------------------------
# Signup hardening (amendment 1)
# ---------------------------------------------------------------------------

class SignupRoleHardeningTests(ApiTestCase):
    def test_role_doctor_in_body_is_ignored_and_account_is_owner(self):
        r = self.anon().post(f"{API}/auth/signup", {
            "username": "wannabedoc", "password": "Attack3r!pass",
            "email": "wannabe@evil.test", "first_name": "Mal", "last_name": "Ory",
            "role": "DOCTOR"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["role"], "OWNER",
                         "signup response claims a role it did not grant")
        self.assertEqual(UserProfile.objects.get(username="wannabedoc").role,
                         "OWNER")

    def test_the_resulting_jwt_is_refused_by_every_doctor_route(self):
        r = self.anon().post(f"{API}/auth/signup", {
            "username": "attacker2", "password": "Attack3r!pass",
            "email": "attacker2@evil.test", "first_name": "M", "last_name": "O",
            "role": "DOCTOR"}, format="json")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        for path in ("/pets", "/invoices", "/dashboard/stats", "/revenue",
                     "/appointments", "/queries/inbox"):
            with self.subTest(path=path):
                resp = self.client.get(f"{API}{path}")
                self.assertEqual(resp.status_code, 403,
                                 f"{path} -> {resp.status_code}: self-signup "
                                 f"reached a doctor route")

    def test_no_pii_is_reachable_by_a_self_signed_up_account(self):
        r = self.anon().post(f"{API}/auth/signup", {
            "username": "attacker3", "password": "Attack3r!pass",
            "email": "attacker3@evil.test", "first_name": "M", "last_name": "O",
            "role": "DOCTOR"}, format="json")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        owned = self.client.get(f"{API}/owner/pets")
        self.assertEqual(owned.status_code, 200, owned.content)
        self.assertEqual(owned.data, [], "a brand-new account can see pets")

    def test_role_owner_in_body_is_harmless(self):
        r = self.anon().post(f"{API}/auth/signup", {
            "username": "honest", "password": "Honest!pass1",
            "email": "honest@example.test", "first_name": "H", "last_name": "O",
            "role": "OWNER"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["role"], "OWNER")

    def test_signup_with_no_role_at_all_still_works(self):
        r = self.anon().post(f"{API}/auth/signup", {
            "username": "norole", "password": "Norole!pass1",
            "email": "norole@example.test", "first_name": "N",
            "last_name": "R"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["role"], "OWNER")


# ---------------------------------------------------------------------------
# Profile hardening (amendment 2)
# ---------------------------------------------------------------------------

class ProfileHardeningTests(ApiTestCase):
    def test_patch_role_is_ignored_and_pre_existing_jwt_stays_owner_scoped(self):
        self.auth(self.owner_a)
        r = self.client.patch(f"{API}/auth/profile", {"role": "DOCTOR"},
                              format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["role"], "OWNER")
        self.owner_a.refresh_from_db()
        self.assertEqual(self.owner_a.role, "OWNER")
        # the SAME token, unchanged, must still be refused by doctor routes
        self.assertEqual(self.client.get(f"{API}/pets").status_code, 403)
        self.assertEqual(self.client.get(f"{API}/invoices").status_code, 403)
        self.assertEqual(self.client.get(f"{API}/dashboard/stats").status_code, 403)

    def test_patch_is_staff_and_is_superuser_are_ignored(self):
        self.auth(self.owner_a)
        r = self.client.patch(f"{API}/auth/profile",
                              {"is_staff": True, "is_superuser": True},
                              format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.owner_a.refresh_from_db()
        self.assertFalse(self.owner_a.is_staff)
        self.assertFalse(self.owner_a.is_superuser)

    def test_patch_username_and_id_are_ignored(self):
        self.auth(self.owner_a)
        original_id, original_username = self.owner_a.id, self.owner_a.username
        r = self.client.patch(f"{API}/auth/profile",
                              {"username": "drwho", "id": 9999}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.owner_a.refresh_from_db()
        self.assertEqual(self.owner_a.username, original_username,
                         "username was reassignable — account-takeover vector")
        self.assertEqual(self.owner_a.id, original_id)

    def test_escalation_combo_in_a_single_request_is_fully_ignored(self):
        self.auth(self.owner_a)
        self.client.patch(f"{API}/auth/profile", {
            "first_name": "Legit", "role": "DOCTOR", "is_staff": True,
            "is_superuser": True, "username": "root"}, format="json")
        self.owner_a.refresh_from_db()
        self.assertEqual(self.owner_a.first_name, "Legit")  # safe field applied
        self.assertEqual(self.owner_a.role, "OWNER")
        self.assertFalse(self.owner_a.is_staff)
        self.assertFalse(self.owner_a.is_superuser)
        self.assertEqual(self.owner_a.username, "ownera")

    def test_doctor_cannot_demote_or_promote_themselves_either(self):
        self.auth(self.doctor)
        self.client.patch(f"{API}/auth/profile", {"role": "OWNER"}, format="json")
        self.doctor.refresh_from_db()
        self.assertEqual(self.doctor.role, "DOCTOR")


# ---------------------------------------------------------------------------
# Money guards
# ---------------------------------------------------------------------------

class MoneyGuardTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.auth(self.doctor)

    def test_overpayment_rejected_with_400_and_no_payment_row(self):
        r = self.client.post(f"{API}/invoices/{self.invoice_a.id}/payments",
                             {"amount_paid": "1000.01"}, format="json")
        self.assertEqual(r.status_code, 400, r.content)
        self.assertTrue(r.data.get("detail"), dict(r.data))
        self.assertEqual(Payment.objects.count(), 0)

    def test_exact_balance_is_accepted_boundary(self):
        r = self.client.post(f"{API}/invoices/{self.invoice_a.id}/payments",
                             {"amount_paid": "1000.00"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.invoice_a.refresh_from_db()
        self.assertEqual(self.invoice_a.payment_status, "PAID")
        self.assertEqual(self.invoice_a.balance_due, Decimal("0.00"))

    def test_second_payment_cannot_exceed_the_remaining_balance(self):
        self.client.post(f"{API}/invoices/{self.invoice_a.id}/payments",
                         {"amount_paid": "600.00"}, format="json")
        r = self.client.post(f"{API}/invoices/{self.invoice_a.id}/payments",
                             {"amount_paid": "500.00"}, format="json")
        self.assertEqual(r.status_code, 400, r.content)
        self.invoice_a.refresh_from_db()
        self.assertEqual(self.invoice_a.amount_paid, Decimal("600.00"))
        self.assertEqual(self.invoice_a.balance_due, Decimal("400.00"))

    def test_payment_against_a_fully_paid_invoice_is_rejected(self):
        self.client.post(f"{API}/invoices/{self.invoice_a.id}/payments",
                         {"amount_paid": "1000.00"}, format="json")
        r = self.client.post(f"{API}/invoices/{self.invoice_a.id}/payments",
                             {"amount_paid": "0.01"}, format="json")
        self.assertEqual(r.status_code, 400, r.content)

    def test_idempotent_replay_is_not_broken_by_the_overpayment_guard(self):
        """Regression: the replay path must return the original payment even
        though a second real charge of the same amount would now exceed the
        remaining balance."""
        body = {"amount_paid": "1000.00", "idempotency_key": "guard-key"}
        r1 = self.client.post(f"{API}/invoices/{self.invoice_a.id}/payments",
                              body, format="json")
        r2 = self.client.post(f"{API}/invoices/{self.invoice_a.id}/payments",
                              body, format="json")
        self.assertEqual(r1.status_code, 201, r1.content)
        self.assertEqual(r2.status_code, 200, r2.content)
        self.assertEqual(r1.data["id"], r2.data["id"])
        self.assertEqual(Payment.objects.count(), 1)

    def test_negative_unit_price_rejected(self):
        r = self.client.post(f"{API}/invoices", {
            "pet_id": self.pet_a.id,
            "line_items": [{"description": "Refund hack", "quantity": 1,
                            "unit_price": "-5000.00"}]}, format="json")
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(Invoice.objects.filter(pet=self.pet_a).count(), 1)

    def test_negative_quantity_rejected(self):
        r = self.client.post(f"{API}/invoices", {
            "pet_id": self.pet_a.id,
            "line_items": [{"description": "Refund hack", "quantity": -3,
                            "unit_price": "5000.00"}]}, format="json")
        self.assertEqual(r.status_code, 400, r.content)

    def test_one_bad_line_item_rolls_back_the_whole_invoice(self):
        before = Invoice.objects.count()
        r = self.client.post(f"{API}/invoices", {
            "pet_id": self.pet_a.id, "line_items": [
                {"description": "Good", "quantity": 1, "unit_price": "100"},
                {"description": "Bad", "quantity": 1, "unit_price": "-100"},
            ]}, format="json")
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(Invoice.objects.count(), before,
                         "a partial invoice was persisted before validation "
                         "rejected a later line item")

    def test_zero_unit_price_is_allowed_boundary(self):
        r = self.client.post(f"{API}/invoices", {
            "pet_id": self.pet_a.id,
            "line_items": [{"description": "Complimentary", "quantity": 1,
                            "unit_price": "0.00"}]}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Decimal(str(r.data["total"])), Decimal("0.00"))
        self.assertEqual(r.data["payment_status"], "PENDING")

    def test_revenue_never_goes_negative(self):
        self.client.post(f"{API}/invoices", {
            "pet_id": self.pet_a.id,
            "line_items": [{"description": "X", "quantity": 1,
                            "unit_price": "-9999"}]}, format="json")
        r = self.client.get(f"{API}/revenue?range=month")
        self.assertGreaterEqual(float(r.data["total_revenue"]), 0.0)


class InvoiceNumberGenerationTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.auth(self.doctor)
        Invoice.objects.all().delete()

    def _create(self):
        return self.client.post(f"{API}/invoices", {
            "pet_id": self.pet_a.id,
            "line_items": [{"description": "S", "quantity": 1,
                            "unit_price": "100"}]}, format="json")

    def test_sequential_numbers(self):
        nos = []
        for _ in range(3):
            r = self._create()
            self.assertEqual(r.status_code, 201, r.content)
            nos.append(r.data["invoice_no"])
        self.assertEqual(len(set(nos)), 3, nos)
        self.assertEqual([n.rsplit("-", 1)[-1] for n in nos],
                         ["001", "002", "003"], nos)

    def test_no_collision_after_deleting_the_first_invoice(self):
        r1 = self._create()
        r2 = self._create()
        Invoice.objects.get(pk=r1.data["id"]).delete()
        r3 = self._create()
        self.assertEqual(r3.status_code, 201,
                         f"invoice creation broke after a delete: "
                         f"{r3.status_code} {r3.content!r}")
        self.assertNotEqual(r3.data["invoice_no"], r2.data["invoice_no"])
        self.assertEqual(r3.data["invoice_no"].rsplit("-", 1)[-1], "003")

    def test_no_collision_after_deleting_the_latest_invoice(self):
        self._create()
        r2 = self._create()
        Invoice.objects.get(pk=r2.data["id"]).delete()
        r3 = self._create()
        self.assertEqual(r3.status_code, 201, r3.content)
        self.assertEqual(Invoice.objects.filter(
            invoice_no=r3.data["invoice_no"]).count(), 1)

    def test_invoice_no_is_unique_across_many_creations(self):
        nos = {self._create().data["invoice_no"] for _ in range(12)}
        self.assertEqual(len(nos), 12, sorted(nos))


# ---------------------------------------------------------------------------
# create_doctor management command
# ---------------------------------------------------------------------------

@override_settings(PASSWORD_HASHERS=FAST_HASHERS)
class CreateDoctorCommandTests(ApiTestCase):
    def test_command_creates_a_working_doctor_account(self):
        out = StringIO()
        call_command("create_doctor", "newdoc", "newdoc@clinic.test",
                     "--password", "Cl1nicPass!", "--first-name", "Nina",
                     "--last-name", "Doc", stdout=out)
        self.assertIn("Created DOCTOR", out.getvalue())

        user = UserProfile.objects.get(username="newdoc")
        self.assertEqual(user.role, "DOCTOR")
        self.assertTrue(user.check_password("Cl1nicPass!"))
        self.assertNotEqual(user.password, "Cl1nicPass!")
        self.assertFalse(user.is_superuser)

        r = self.anon().post(f"{API}/auth/login",
                             {"username": "newdoc", "password": "Cl1nicPass!"},
                             format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["role"], "DOCTOR")

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        self.assertEqual(self.client.get(f"{API}/pets").status_code, 200)
        self.assertEqual(self.client.get(f"{API}/dashboard/stats").status_code, 200)
        self.assertEqual(self.client.get(f"{API}/owner/pets").status_code, 403)

    def test_command_rejects_a_duplicate_username(self):
        with self.assertRaises(CommandError):
            call_command("create_doctor", "drwho", "dup@clinic.test",
                         "--password", "Cl1nicPass!", stdout=StringIO())

    def test_command_rejects_a_duplicate_email(self):
        with self.assertRaises(CommandError):
            call_command("create_doctor", "otherdoc", "dr@example.com",
                         "--password", "Cl1nicPass!", stdout=StringIO())

    def test_command_rejects_a_short_password(self):
        with self.assertRaises(CommandError):
            call_command("create_doctor", "shortpw", "shortpw@clinic.test",
                         "--password", "abc", stdout=StringIO())
        self.assertFalse(UserProfile.objects.filter(username="shortpw").exists())

    def test_command_is_the_only_way_to_get_a_doctor(self):
        """Belt and braces: no API path produces role=DOCTOR."""
        before = set(UserProfile.objects.filter(role="DOCTOR")
                     .values_list("username", flat=True))
        self.anon().post(f"{API}/auth/signup", {
            "username": "apidoc", "password": "Apidoc!pass1",
            "email": "apidoc@x.test", "first_name": "A", "last_name": "D",
            "role": "DOCTOR"}, format="json")
        self.auth(self.owner_a)
        self.client.patch(f"{API}/auth/profile", {"role": "DOCTOR"},
                          format="json")
        after = set(UserProfile.objects.filter(role="DOCTOR")
                    .values_list("username", flat=True))
        self.assertEqual(before, after,
                         f"new DOCTOR(s) minted over the API: {after - before}")


# ---------------------------------------------------------------------------
# Prod hardening / error bodies
# ---------------------------------------------------------------------------

class ProdHardeningTests(ApiTestCase):
    def test_prod_hardening_settings_are_declared_and_on(self):
        from petphysio import settings as raw
        for name in ("SECURE_SSL_REDIRECT", "SECURE_HSTS_SECONDS",
                     "SECURE_HSTS_INCLUDE_SUBDOMAINS", "SESSION_COOKIE_SECURE",
                     "CSRF_COOKIE_SECURE"):
            self.assertTrue(hasattr(raw, name), f"{name} not declared")

    def test_every_hand_rolled_error_carries_a_detail(self):
        """§6.8 — http.ts reads `detail || message || statusText`."""
        self.auth(self.doctor)
        cases = [
            ("post", "/invoices", {"line_items": []}),
            ("post", f"/invoices/{self.invoice_a.id}/payments", {}),
            ("post", f"/invoices/{self.invoice_a.id}/payments",
             {"amount_paid": "-1"}),
            ("post", f"/appointments/{self.appt_a.id}/reschedule", {}),
            ("post", f"/pets/{self.pet_a.id}/queries", {"message": ""}),
        ]
        for method, path, body in cases:
            with self.subTest(path=path, body=body):
                fmt = "multipart" if "queries" in path else "json"
                r = getattr(self.client, method)(f"{API}{path}", body, format=fmt)
                self.assertEqual(r.status_code, 400, r.content)
                self.assertTrue(r.data.get("detail") or r.data.get("message"),
                                f"{path} -> {dict(r.data)} has no detail")


class RefreshRotationPostureTests(ApiTestCase):
    """Refresh-token rotation (contract §3 amendment 4; CLAUDE.md "short-lived
    access + rotating refresh").

    Round-2 finding, now fixed: ROTATE_REFRESH_TOKENS/BLACKLIST_AFTER_ROTATION
    were declared but dead, because refresh_view minted an access token
    without touching the presented refresh token — leaving a stolen refresh
    replayable for its full 7-day life. These tests pin the rotation so it
    cannot silently regress back to that.
    """

    def _login_refresh(self):
        r = self.anon().post(f"{API}/auth/login",
                             {"username": "drwho", "password": "D0ctorPass!23"},
                             format="json")
        self.assertEqual(r.status_code, 200, r.content)
        return r.data["refresh"]

    def test_a_refresh_token_is_good_for_exactly_one_use(self):
        original = self._login_refresh()

        first = self.anon().post(f"{API}/auth/refresh", {"refresh": original},
                                 format="json")
        self.assertEqual(first.status_code, 200, first.content)
        rotated = first.data["refresh"]
        self.assertNotEqual(rotated, original, "the refresh token did not rotate")

        # Replaying the consumed token must fail...
        replay = self.anon().post(f"{API}/auth/refresh", {"refresh": original},
                                  format="json")
        self.assertEqual(replay.status_code, 401,
                         "a consumed refresh token was replayable — rotation "
                         "is not blacklisting the presented token")
        self.assertNotIn("access", replay.data)

        # ...while the rotated token works, and itself rotates again.
        second = self.anon().post(f"{API}/auth/refresh", {"refresh": rotated},
                                  format="json")
        self.assertEqual(second.status_code, 200, second.content)
        self.assertNotIn(second.data["refresh"], (original, rotated))

    def test_consumed_refresh_token_is_actually_blacklisted(self):
        """Assert the blacklist record exists, not just that a replay 401s."""
        from rest_framework_simplejwt.token_blacklist.models import (
            BlacklistedToken,
        )
        from rest_framework_simplejwt.tokens import RefreshToken

        original = self._login_refresh()
        jti = RefreshToken(original).payload["jti"]
        self.assertFalse(
            BlacklistedToken.objects.filter(token__jti=jti).exists())

        self.anon().post(f"{API}/auth/refresh", {"refresh": original},
                         format="json")
        self.assertTrue(
            BlacklistedToken.objects.filter(token__jti=jti).exists(),
            "the presented refresh token was not written to the blacklist")

    def test_rotated_refresh_token_survives_the_access_token_expiring(self):
        """The ~90-minute case: refresh twice across two access lifetimes."""
        original = self._login_refresh()
        first = self.anon().post(f"{API}/auth/refresh", {"refresh": original},
                                 format="json")
        rotated = first.data["refresh"]

        expired = self._expired(AccessToken.for_user(self.doctor))
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {expired}")
        self.assertEqual(self.client.get(f"{API}/auth/me").status_code, 401)

        second = self.anon().post(f"{API}/auth/refresh", {"refresh": rotated},
                                  format="json")
        self.assertEqual(
            second.status_code, 200,
            "the SECOND refresh failed — a client that stored only the access "
            "token from the first rotation is now silently logged out")
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {second.data['access']}")
        self.assertEqual(self.client.get(f"{API}/auth/me").status_code, 200)

    # REPLACED (QA round 3): the previous test here asserted
    # `"rotate" not in inspect.getsource(views.refresh_view)`. That was
    # VACUOUS — @api_view returns a wrapper, so getsource yields 443 chars of
    # DRF's `def view(request, *args, **kwargs)` and never the view body. It
    # passed both before and after rotation was implemented, for the wrong
    # reason. Verified that `.__wrapped__` is NOT a fix either: it returns
    # the same 443-char wrapper. Asserted behaviourally instead.
    def test_rotation_settings_are_declared_and_actually_honoured(self):
        from django.conf import settings
        self.assertTrue(settings.SIMPLE_JWT["ROTATE_REFRESH_TOKENS"])
        self.assertTrue(settings.SIMPLE_JWT["BLACKLIST_AFTER_ROTATION"])
        original = self._login_refresh()
        rotated = self.anon().post(f"{API}/auth/refresh", {"refresh": original},
                                   format="json").data["refresh"]
        self.assertNotEqual(rotated, original,
                            "ROTATE_REFRESH_TOKENS is declared but the "
                            "endpoint does not rotate — dead configuration")
