"""RBAC + audit-logging coverage across every domain (SRS §3.1 + §4).

Run with:  ./.venv/bin/python manage.py test appointments.test_rbac_audit

These tests exercise the REAL stack through the mounted ``/api/v1`` URLs and the
Django test client, so every request passes the full authentication +
permission chain AND the ``AuditMiddleware`` (which sits last in MIDDLEWARE). No
views are dispatched in isolation — that is deliberate: RBAC only means anything
end-to-end, and the audit trail is only written when the middleware actually
runs after the view.

US-AUTH-03 (RBAC): for a representative endpoint in each domain — dashboard,
appointments, pets, diagnoses, treatment-plans, invoices, notifications —
    * no token / no session          -> 401 (Bearer challenge)
    * a valid JWT WITHOUT role=DOCTOR -> 403 (IsVet rejects the verified claim)
    * a valid DOCTOR JWT             -> 200
    * a DOCTOR accessing another doctor's object -> 404 (ownership scoping)
The DOCTOR role is read ONLY from the verified token claim; putting
``{"role": "DOCTOR"}`` in the request body gains a non-DOCTOR token nothing.

US-AUTH-05 (audit): a create / update / delete each writes EXACTLY ONE AuditLog
row carrying the acting user id, the action verb, the entity_type (+entity_id
when the path has one) and a timestamp; a GET writes zero rows; login and logout
each write a row; and a transparent mutation (appointment-complete) writes its
audit row without altering the response body or status the caller sees.
"""

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from .models import (
    Appointment,
    AuditLog,
    Diagnosis,
    Invoice,
    Notification,
    Pet,
    TreatmentPlan,
)
from .tests import PASSWORD, make_doctor, make_pet


# ---------------------------------------------------------------------------
# Token helpers — mirror api._tokens_for (role set on the refresh, inherited by
# the access token) vs. a bare token with NO role claim.
# ---------------------------------------------------------------------------
def doctor_access(user):
    """A verified access token carrying the DOCTOR role claim."""
    refresh = RefreshToken.for_user(user)
    refresh["role"] = "DOCTOR"
    return str(refresh.access_token)


def plain_access(user):
    """A verified access token with NO role claim (a valid non-DOCTOR token)."""
    return str(AccessToken.for_user(user))


def bearer(token):
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


def make_appointment(doctor, pet):
    return Appointment.objects.create(
        doctor=doctor,
        pet=pet,
        visit_type=Appointment.VISIT_CLINIC,
        date=timezone.localdate(),
        time="10:30",
        status=Appointment.STATUS_PENDING,
    )


def make_diagnosis(doctor, pet):
    return Diagnosis.objects.create(
        pet=pet,
        doctor=doctor,
        report_type=Diagnosis.XRAY,
        file=SimpleUploadedFile("scan.png", b"\x89PNG..", content_type="image/png"),
        original_filename="scan.png",
        mime="image/png",
        size=8,
    )


def make_plan(doctor, pet):
    return TreatmentPlan.objects.create(
        pet=pet,
        doctor=doctor,
        therapies=[TreatmentPlan.LASER],
        frequency=TreatmentPlan.DAILY,
        duration=TreatmentPlan.DUR_4WK,
        start_date=timezone.localdate(),
        status=TreatmentPlan.ACTIVE,
    )


def make_invoice(doctor, pet, invoice_no=1):
    return Invoice.objects.create(
        doctor=doctor,
        pet=pet,
        invoice_no=invoice_no,
        line_items=[{"description": "Consult", "quantity": 1,
                     "unit_price": "100.00", "amount": "100.00"}],
    )


# ---------------------------------------------------------------------------
# US-AUTH-03 — the 401 / 403 / 200 matrix, one representative GET per domain.
# ---------------------------------------------------------------------------
class RbacMatrixTests(TestCase):
    def setUp(self):
        self.doc = make_doctor("drbob")
        self.pet = make_pet(self.doc)
        # Representative read endpoint for each domain. All return 200 for the
        # owning DOCTOR; the pet-scoped ones use the doctor's own pet.
        self.endpoints = {
            "dashboard": "/api/v1/dashboard/stats",
            "appointments": "/api/v1/appointments",
            "pets": "/api/v1/pets",
            "diagnoses": f"/api/v1/pets/{self.pet.id}/diagnoses",
            "treatment-plans": f"/api/v1/pets/{self.pet.id}/treatment-plans",
            "invoices": "/api/v1/invoices",
            "notifications": "/api/v1/notifications",
        }

    def test_no_token_returns_401_everywhere(self):
        anon = APIClient()  # no Authorization header, no session
        for domain, url in self.endpoints.items():
            with self.subTest(domain=domain):
                self.assertEqual(anon.get(url).status_code, 401)

    def test_valid_non_doctor_token_returns_403_everywhere(self):
        # A fully-verified token whose role claim != DOCTOR must be rejected by
        # IsVet with 403 (authenticated, but not authorised) — NOT 401.
        token = plain_access(self.doc)
        for domain, url in self.endpoints.items():
            with self.subTest(domain=domain):
                c = APIClient()
                c.credentials(**bearer(token))
                self.assertEqual(c.get(url).status_code, 403)

    def test_valid_doctor_token_returns_200_everywhere(self):
        token = doctor_access(self.doc)
        for domain, url in self.endpoints.items():
            with self.subTest(domain=domain):
                c = APIClient()
                c.credentials(**bearer(token))
                self.assertEqual(c.get(url).status_code, 200)


# ---------------------------------------------------------------------------
# US-AUTH-03 — role is trusted only from the verified claim, never the body.
# ---------------------------------------------------------------------------
class RbacRoleFromClaimOnlyTests(TestCase):
    def setUp(self):
        self.doc = make_doctor("drbob")

    def test_role_in_body_does_not_elevate_a_non_doctor_token(self):
        # Non-DOCTOR token + a lying {"role": "DOCTOR"} body -> still 403. The
        # body cannot grant a role; only the signed claim can.
        c = APIClient()
        c.credentials(**bearer(plain_access(self.doc)))
        resp = c.post(
            "/api/v1/pets",
            {"role": "DOCTOR", "name": "Bruno", "pet_type": "Dog",
             "owner_name": "Asha", "owner_phone": "+919876543210"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)
        self.assertFalse(Pet.objects.exists())  # request never reached the view

    def test_doctor_token_with_matching_body_still_creates(self):
        # Sanity: the DOCTOR claim (not the body) is what authorises the write.
        c = APIClient()
        c.credentials(**bearer(doctor_access(self.doc)))
        resp = c.post(
            "/api/v1/pets",
            {"role": "DOCTOR", "name": "Bruno", "pet_type": "Dog",
             "owner_name": "Asha", "owner_phone": "+919876543210"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)


# ---------------------------------------------------------------------------
# US-AUTH-03 — a DOCTOR still cannot reach another doctor's objects (404).
# ---------------------------------------------------------------------------
class RbacCrossOwnerTests(TestCase):
    def setUp(self):
        self.doc = make_doctor("drbob")
        self.other = make_doctor("drother")
        self.other_pet = make_pet(self.other, name="Theirs", owner="Zed")
        self.client = APIClient()
        self.client.credentials(**bearer(doctor_access(self.doc)))

    def test_cross_owner_object_access_is_404_across_domains(self):
        appt = make_appointment(self.other, self.other_pet)
        diag = make_diagnosis(self.other, self.other_pet)
        plan = make_plan(self.other, self.other_pet)
        inv = make_invoice(self.other, self.other_pet)
        note = Notification.objects.create(
            user=self.other, type=Notification.APPOINTMENT_CREATED, message="hi"
        )
        cases = {
            "pet": ("get", f"/api/v1/pets/{self.other_pet.id}"),
            "appointment": ("get", f"/api/v1/appointments/{appt.id}"),
            "diagnosis": ("get", f"/api/v1/diagnoses/{diag.id}"),
            "treatment-plan": ("get", f"/api/v1/treatment-plans/{plan.id}"),
            "invoice": ("get", f"/api/v1/invoices/{inv.id}"),
            "notification": ("post", f"/api/v1/notifications/{note.id}/read"),
        }
        for domain, (verb, url) in cases.items():
            with self.subTest(domain=domain):
                resp = getattr(self.client, verb)(url)
                self.assertEqual(resp.status_code, 404)
        # The cross-owner notification was NOT mutated by the denied request.
        note.refresh_from_db()
        self.assertFalse(note.is_read)


# ---------------------------------------------------------------------------
# US-AUTH-05 — CRUD writes exactly one audit row; GET writes none.
# ---------------------------------------------------------------------------
class AuditCrudTests(TestCase):
    def setUp(self):
        self.doc = make_doctor("drbob")
        self.pet = make_pet(self.doc)
        self.client = APIClient()
        self.client.credentials(**bearer(doctor_access(self.doc)))

    def test_create_writes_exactly_one_row_attributed_to_the_user(self):
        AuditLog.objects.all().delete()
        resp = self.client.post(
            "/api/v1/pets",
            {"name": "Bruno", "pet_type": "Dog",
             "owner_name": "Asha", "owner_phone": "+919876543210"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(AuditLog.objects.count(), 1)  # exactly one
        log = AuditLog.objects.get()
        self.assertEqual(log.user_id, self.doc.id)      # acting user id
        self.assertEqual(log.action, AuditLog.CREATE)   # action verb
        self.assertEqual(log.entity_type, "pets")       # entity type
        self.assertIsNone(log.entity_id)                # collection POST -> no id in path
        self.assertEqual(log.method, "POST")
        self.assertEqual(log.status_code, 201)
        self.assertIsNotNone(log.created_at)            # timestamp

    def test_update_writes_exactly_one_row_with_entity_id(self):
        plan = make_plan(self.doc, self.pet)
        AuditLog.objects.all().delete()
        resp = self.client.patch(
            f"/api/v1/treatment-plans/{plan.id}",
            {"status": TreatmentPlan.ON_HOLD},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(AuditLog.objects.count(), 1)
        log = AuditLog.objects.get()
        self.assertEqual(log.user_id, self.doc.id)
        self.assertEqual(log.action, AuditLog.UPDATE)
        self.assertEqual(log.entity_type, "treatment-plans")
        self.assertEqual(log.entity_id, str(plan.id))
        self.assertEqual(log.method, "PATCH")
        self.assertEqual(log.status_code, 200)

    def test_delete_writes_exactly_one_row(self):
        diag = make_diagnosis(self.doc, self.pet)
        AuditLog.objects.all().delete()
        resp = self.client.delete(f"/api/v1/diagnoses/{diag.id}")
        self.assertEqual(resp.status_code, 204)
        self.assertEqual(AuditLog.objects.count(), 1)
        log = AuditLog.objects.get()
        self.assertEqual(log.user_id, self.doc.id)
        self.assertEqual(log.action, AuditLog.DELETE)
        self.assertEqual(log.entity_type, "diagnoses")
        self.assertEqual(log.entity_id, str(diag.id))
        self.assertEqual(log.method, "DELETE")
        self.assertEqual(log.status_code, 204)

    def test_get_writes_zero_rows(self):
        AuditLog.objects.all().delete()
        self.assertEqual(self.client.get("/api/v1/pets").status_code, 200)
        self.assertEqual(
            self.client.get(f"/api/v1/pets/{self.pet.id}").status_code, 200
        )
        self.assertEqual(self.client.get("/api/v1/dashboard/stats").status_code, 200)
        self.assertEqual(AuditLog.objects.count(), 0)


# ---------------------------------------------------------------------------
# US-AUTH-05 — login and logout each write a row.
# ---------------------------------------------------------------------------
class AuditAuthEventTests(TestCase):
    def setUp(self):
        self.doc = make_doctor("drbob")
        self.client = APIClient()

    def test_login_then_logout_each_write_one_row(self):
        AuditLog.objects.all().delete()
        login = self.client.post(
            "/api/v1/auth/login",
            {"username": "drbob", "password": PASSWORD},
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        login_rows = AuditLog.objects.filter(action=AuditLog.LOGIN)
        self.assertEqual(login_rows.count(), 1)
        self.assertEqual(login_rows.get().user_id, self.doc.id)

        # Logout carrying the Bearer access token (so the actor is attributed)
        # plus the refresh in the body (server-side revocation).
        self.client.credentials(**bearer(login.data["access"]))
        logout = self.client.post(
            "/api/v1/auth/logout",
            {"refresh": login.data["refresh"]},
            format="json",
        )
        self.assertEqual(logout.status_code, 204)
        logout_rows = AuditLog.objects.filter(action=AuditLog.LOGOUT)
        self.assertEqual(logout_rows.count(), 1)
        self.assertEqual(logout_rows.get().user_id, self.doc.id)

    def test_auth_events_are_not_double_logged_as_generic_crud(self):
        # The /auth/ POSTs must NOT also produce a generic CREATE row via the
        # middleware (record_event owns these events).
        AuditLog.objects.all().delete()
        self.client.post(
            "/api/v1/auth/login",
            {"username": "drbob", "password": PASSWORD},
            format="json",
        )
        self.assertFalse(AuditLog.objects.filter(action=AuditLog.CREATE).exists())


# ---------------------------------------------------------------------------
# US-AUTH-05 — a transparent mutation writes its audit row WITHOUT changing the
# response body or status the caller receives.
# ---------------------------------------------------------------------------
class AuditTransparentMutationTests(TestCase):
    def setUp(self):
        self.doc = make_doctor("drbob")
        self.pet = make_pet(self.doc)
        self.client = APIClient()
        self.client.credentials(**bearer(doctor_access(self.doc)))

    def test_appointment_complete_is_audited_without_altering_the_response(self):
        appt = make_appointment(self.doc, self.pet)
        AuditLog.objects.all().delete()
        resp = self.client.post(f"/api/v1/appointments/{appt.id}/complete")

        # The response is exactly the normal success response — auditing is a
        # side channel and never touches status or body.
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["id"], appt.id)
        self.assertEqual(resp.data["status"], Appointment.STATUS_COMPLETED)
        appt.refresh_from_db()
        self.assertEqual(appt.status, Appointment.STATUS_COMPLETED)

        # Exactly one audit row was still written for the mutation.
        self.assertEqual(AuditLog.objects.count(), 1)
        log = AuditLog.objects.get()
        self.assertEqual(log.user_id, self.doc.id)
        self.assertEqual(log.action, AuditLog.CREATE)  # POST -> CREATE verb
        self.assertEqual(log.entity_type, "appointments")
        self.assertEqual(log.entity_id, str(appt.id))
        self.assertEqual(log.status_code, 200)
