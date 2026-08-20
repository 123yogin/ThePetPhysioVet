"""Role separation + object-level ownership (API_CONTRACT.md §4, CLAUDE.md rule 4).

Key rule under test (§4.3): "An owner requesting another owner's pet gets 404,
not 403 — do not leak existence." Exercised per resource type.
"""

from appointments.models import Invoice, Pet, QueryMessage

from .base import API, ApiTestCase


class RoleSeparationTests(ApiTestCase):
    OWNER_ROUTES_GET = ["/owner/pets", "/owner/appointments", "/owner/invoices"]
    DOCTOR_ROUTES_GET = ["/dashboard/stats", "/pets", "/appointments",
                         "/invoices", "/revenue", "/queries/inbox"]

    def test_doctor_hitting_owner_routes_gets_403(self):
        self.auth(self.doctor)
        for path in self.OWNER_ROUTES_GET:
            with self.subTest(path=path):
                r = self.client.get(f"{API}{path}")
                self.assertEqual(r.status_code, 403, f"{path} -> {r.status_code}")

    def test_doctor_hitting_owner_detail_routes_gets_403(self):
        self.auth(self.doctor)
        r = self.client.get(f"{API}/owner/pets/{self.pet_a.id}")
        self.assertEqual(r.status_code, 403, r.content)

    def test_owner_hitting_doctor_routes_gets_403(self):
        self.auth(self.owner_a)
        for path in self.DOCTOR_ROUTES_GET:
            with self.subTest(path=path):
                r = self.client.get(f"{API}{path}")
                self.assertEqual(r.status_code, 403, f"{path} -> {r.status_code}")

    def test_owner_cannot_read_doctor_detail_routes(self):
        self.auth(self.owner_a)
        # Even for their OWN pet, the doctor-scoped route is role-gated.
        for path in (f"/pets/{self.pet_a.id}",
                     f"/appointments/{self.appt_a.id}",
                     f"/invoices/{self.invoice_a.id}",
                     f"/treatment-plans/{self.plan_a.id}",
                     f"/pets/{self.pet_a.id}/diagnoses",
                     f"/pets/{self.pet_a.id}/queries"):
            with self.subTest(path=path):
                r = self.client.get(f"{API}{path}")
                self.assertEqual(r.status_code, 403, f"{path} -> {r.status_code}")

    def test_owner_cannot_mutate_doctor_routes(self):
        self.auth(self.owner_a)
        cases = [
            ("post", f"/appointments/{self.appt_a.id}/complete", {}),
            ("post", f"/appointments/{self.appt_a.id}/reschedule-approve", {}),
            ("post", f"/invoices/{self.invoice_a.id}/payments", {"amount_paid": 1}),
            ("post", "/invoices", {"pet_id": 1, "line_items": []}),
            ("delete", "/diagnoses/1", {}),
        ]
        for method, path, body in cases:
            with self.subTest(path=path):
                r = getattr(self.client, method)(f"{API}{path}", body, format="json")
                self.assertEqual(r.status_code, 403, f"{path} -> {r.status_code}")


class CrossOwnerIsolationTests(ApiTestCase):
    """Owner A must never see or touch Owner B's data — and must get 404."""

    def test_owner_pet_list_returns_only_own_rows(self):
        self.auth(self.owner_a)
        r = self.client.get(f"{API}/owner/pets")
        self.assertEqual(r.status_code, 200, r.content)
        ids = {p["id"] for p in r.data}
        self.assertEqual(ids, {self.pet_a.id})
        self.assertNotIn(self.pet_b.id, ids)

    def test_owner_appointment_list_returns_only_own_rows(self):
        self.auth(self.owner_a)
        r = self.client.get(f"{API}/owner/appointments")
        self.assertEqual(r.status_code, 200, r.content)
        ids = {a["id"] for a in r.data}
        self.assertEqual(ids, {self.appt_a.id})

    def test_owner_invoice_list_returns_only_own_rows(self):
        self.auth(self.owner_a)
        r = self.client.get(f"{API}/owner/invoices")
        self.assertEqual(r.status_code, 200, r.content)
        nos = {i["invoice_no"] for i in r.data}
        self.assertEqual(nos, {self.invoice_a.invoice_no})

    # --- 404-not-403, per resource type (§4.3) ---------------------------

    def test_cross_owner_pet_detail_is_404(self):
        self.auth(self.owner_a)
        r = self.client.get(f"{API}/owner/pets/{self.pet_b.id}")
        self.assertEqual(r.status_code, 404, f"got {r.status_code}: {r.content}")

    def test_cross_owner_pet_history_write_is_404_and_does_not_mutate(self):
        self.auth(self.owner_a)
        r = self.client.post(f"{API}/owner/pets/{self.pet_b.id}/history",
                             {"notes": "tampered"}, format="json")
        self.assertEqual(r.status_code, 404, f"got {r.status_code}: {r.content}")
        self.pet_b.refresh_from_db()
        self.assertNotEqual(self.pet_b.notes, "tampered")

    def test_cross_owner_pet_diagnosis_upload_is_404(self):
        from .base import upload
        self.auth(self.owner_a)
        r = self.client.post(f"{API}/owner/pets/{self.pet_b.id}/diagnoses",
                             {"file": upload("x.png"), "report_type": "XRAY"},
                             format="multipart")
        self.assertEqual(r.status_code, 404, f"got {r.status_code}: {r.content}")

    def test_cross_owner_appointment_accept_is_404(self):
        self.auth(self.owner_a)
        r = self.client.post(f"{API}/owner/appointments/{self.appt_b.id}/accept",
                             {}, format="json")
        self.assertEqual(r.status_code, 404, f"got {r.status_code}: {r.content}")
        self.appt_b.refresh_from_db()
        self.assertEqual(self.appt_b.status, "Confirmed")

    def test_cross_owner_appointment_reschedule_request_is_404(self):
        self.auth(self.owner_a)
        r = self.client.post(
            f"{API}/owner/appointments/{self.appt_b.id}/reschedule-request",
            {"date": "2030-01-01", "time": "09:00", "reason": "x"}, format="json")
        self.assertEqual(r.status_code, 404, f"got {r.status_code}: {r.content}")
        self.appt_b.refresh_from_db()
        self.assertIsNone(self.appt_b.requested_date)

    def test_cross_owner_query_thread_read_is_404(self):
        self.auth(self.owner_a)
        r = self.client.get(f"{API}/owner/pets/{self.pet_b.id}/queries")
        self.assertEqual(r.status_code, 404, f"got {r.status_code}: {r.content}")

    def test_cross_owner_query_post_is_404_and_creates_no_message(self):
        self.auth(self.owner_a)
        before = QueryMessage.objects.count()
        r = self.client.post(f"{API}/owner/pets/{self.pet_b.id}/queries",
                             {"message": "leak me"}, format="multipart")
        self.assertEqual(r.status_code, 404, f"got {r.status_code}: {r.content}")
        self.assertEqual(QueryMessage.objects.count(), before)

    def test_cross_owner_appointment_creation_for_other_pet_is_404(self):
        self.auth(self.owner_a)
        r = self.client.post(f"{API}/owner/appointments", {
            "pet_id": self.pet_b.id, "date": "2030-05-05", "time": "09:00",
            "visit_type": "Initial"}, format="json")
        self.assertEqual(r.status_code, 404, f"got {r.status_code}: {r.content}")

    def test_nonexistent_id_and_foreign_id_are_indistinguishable(self):
        """Existence must not leak: same status for foreign id and unused id."""
        self.auth(self.owner_a)
        foreign = self.client.get(f"{API}/owner/pets/{self.pet_b.id}").status_code
        missing = self.client.get(f"{API}/owner/pets/999999").status_code
        self.assertEqual(foreign, missing, "response distinguishes foreign vs missing")
        self.assertEqual(foreign, 404)


class OwnerMassAssignmentTests(ApiTestCase):
    def test_owner_cannot_create_pet_owned_by_someone_else(self):
        self.auth(self.owner_a)
        r = self.client.post(f"{API}/owner/pets", {
            "name": "Sneaky", "species": "Dog", "owner": self.owner_b.id,
            "owner_name": "Bob Bee", "owner_phone": "9992220002"},
            format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        pet = Pet.objects.get(name="Sneaky")
        self.assertEqual(pet.owner_id, self.owner_a.id,
                         "client-supplied `owner` overrode request.user")

    def test_doctor_created_pet_cannot_be_assigned_arbitrary_owner_fk(self):
        """`owner` is not a serializer field, so it must be ignored on POST /pets."""
        self.auth(self.doctor)
        r = self.client.post(f"{API}/pets", {
            "name": "DocPet", "species": "Dog", "owner": self.owner_b.id,
            "owner_name": "X", "owner_phone": "1"}, format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        pet = Pet.objects.get(name="DocPet")
        self.assertIsNone(pet.owner_id)


class InvoiceIsolationTests(ApiTestCase):
    def test_owner_invoice_with_null_owner_fk_is_not_leaked(self):
        """Backfill note: unmatched rows stay doctor-visible only."""
        orphan = Invoice.objects.create(invoice_no="INV-ORPHAN", pet=None, owner=None)
        self.auth(self.owner_a)
        r = self.client.get(f"{API}/owner/invoices")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertNotIn("INV-ORPHAN", [i["invoice_no"] for i in r.data])
        self.assertTrue(Invoice.objects.filter(pk=orphan.pk).exists())

    def test_orphan_pet_not_visible_to_any_owner(self):
        orphan = Pet.objects.create(name="Stray", owner=None,
                                    owner_name="?", owner_phone="0")
        self.auth(self.owner_a)
        self.assertEqual(
            self.client.get(f"{API}/owner/pets/{orphan.id}").status_code, 404)
        self.auth(self.owner_b)
        self.assertEqual(
            self.client.get(f"{API}/owner/pets/{orphan.id}").status_code, 404)


class PermissionConfigTests(ApiTestCase):
    def test_default_drf_permission_is_isauthenticated(self):
        from django.conf import settings
        self.assertEqual(
            tuple(settings.REST_FRAMEWORK["DEFAULT_PERMISSION_CLASSES"]),
            ("rest_framework.permissions.IsAuthenticated",))

    # ADJUDICATED after QA round 1: was `["login_view", "signup_view"]`.
    # API_CONTRACT.md §3 (AMENDED 2026-08-20) adds POST /auth/refresh, which
    # is AllowAny by nature — the caller's access token has expired, that is
    # the entire point of the endpoint. Widened to exactly three, and no
    # wider. NOTE: contract §4.1 still reads "exactly two routes" and was not
    # updated alongside §3 — reported as a doc-consistency defect.
    ALLOWANY_ALLOWLIST = ["login_view", "refresh_view", "signup_view"]

    def test_allowany_only_on_login_signup_and_refresh(self):
        """API_CONTRACT.md §4.1 as amended: AllowAny on exactly three routes."""
        from appointments import views
        allowany = []
        for name in dir(views):
            fn = getattr(views, name)
            classes = getattr(fn, "cls", None)
            perms = getattr(classes, "permission_classes", None) if classes else None
            if not perms:
                continue
            if any(p.__name__ == "AllowAny" for p in perms):
                allowany.append(name)
        self.assertEqual(sorted(allowany), self.ALLOWANY_ALLOWLIST,
                         f"unexpected AllowAny routes: {allowany}")

    def test_allowany_refresh_still_authenticates_the_token_itself(self):
        """AllowAny at the permission layer must NOT mean unauthenticated
        token issuance — /auth/refresh has to validate the refresh token."""
        for body in ({}, {"refresh": ""}, {"refresh": "not-a-jwt"},
                     {"refresh": "a.b.c"}):
            with self.subTest(body=body):
                r = self.anon().post(f"{API}/auth/refresh", body, format="json")
                self.assertIn(r.status_code, (400, 401),
                              f"{body} -> {r.status_code} {r.content!r}")
                self.assertNotIn("access", r.data,
                                 "an access token was minted without a valid "
                                 "refresh token")

    def test_cors_allow_all_origins_is_not_enabled(self):
        from django.conf import settings
        self.assertFalse(getattr(settings, "CORS_ALLOW_ALL_ORIGINS", False))
