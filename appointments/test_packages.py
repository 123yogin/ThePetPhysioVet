"""Tests for the package session endpoint + end-to-end decrement (US-PAY-04).

Run with:  ./.venv/bin/python manage.py test appointments.test_packages

Covers SRS §3.8 US-PAY-04:
  * PackageDetailView GET /packages/{id}: IsVet, owner-scoped, returns the
    PackageSerializer shape (total/used/remaining/exhausted).
  * End-to-end decrement via the real POST /appointments/{id}/complete hook:
      - completing a package-covered appointment increments used_sessions by
        exactly one;
      - re-firing Completed for the SAME appointment does NOT double-count
        (PackageSessionConsumption idempotency ledger);
      - the counter never exceeds total_sessions; once exhausted, further
        completions are a no-op and remaining stays 0;
      - used/remaining are visible through the endpoint after completion.

Route note: /packages/{id} is not wired in the shared appointments/api_urls.py
(the Sprint-4 route freeze only covers the eight invoice/payment/revenue
routes). This module owns a test-local ROOT_URLCONF that mounts the real API
(so the appointment-complete billing hook runs over real HTTP) AND the packages
route, giving genuine end-to-end coverage without editing the shared urlconf.
The production wiring is flagged back to the Tech Lead / foundation owner.
"""

import datetime

from django.test import TestCase, override_settings
from django.urls import include, path
from rest_framework.test import APIClient

from .api_packages import PackageDetailView
from .models import Appointment, Invoice, Package, PackageSessionConsumption
from .tests import PASSWORD, make_doctor, make_pet

# Test-local URL map: the real /api/v1 routes (for the /complete hook) plus the
# packages route this task owns.
urlpatterns = [
    path("api/v1/", include("appointments.api_urls")),
    path(
        "api/v1/packages/<int:pk>",
        PackageDetailView.as_view(),
        name="package-detail",
    ),
]


def make_package_invoice(doctor, pet, total_sessions=3):
    """Create a package-mode Invoice + its Package for a pet."""
    from django.db import transaction

    with transaction.atomic():
        invoice = Invoice.objects.create(
            pet=pet,
            doctor=doctor,
            invoice_no=Invoice.objects.allocate_next_no(doctor),
            payment_mode=Invoice.MODE_PACKAGE,
            total=100,
        )
    return Package.objects.create(invoice=invoice, total_sessions=total_sessions)


def make_appointment(doctor, pet, day="2026-07-20"):
    return Appointment.objects.create(
        doctor=doctor,
        pet=pet,
        date=datetime.date.fromisoformat(day),
        time=datetime.time(10, 0),
        status=Appointment.STATUS_PENDING,
    )


@override_settings(ROOT_URLCONF="appointments.test_packages")
class PackageDetailEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.doc = make_doctor("drpkg")
        self.client.login(username="drpkg", password=PASSWORD)
        self.pet = make_pet(self.doc)
        self.package = make_package_invoice(self.doc, self.pet, total_sessions=3)

    # -- endpoint shape / auth / ownership -------------------------------
    def test_get_returns_serializer_shape(self):
        resp = self.client.get(f"/api/v1/packages/{self.package.id}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            set(resp.data),
            {
                "id",
                "invoice_id",
                "total_sessions",
                "used_sessions",
                "remaining",
                "remaining_sessions",
                "exhausted",
            },
        )
        self.assertEqual(resp.data["total_sessions"], 3)
        self.assertEqual(resp.data["used_sessions"], 0)
        self.assertEqual(resp.data["remaining"], 3)
        self.assertFalse(resp.data["exhausted"])

    def test_requires_authentication(self):
        self.client.logout()
        resp = self.client.get(f"/api/v1/packages/{self.package.id}")
        self.assertIn(resp.status_code, (401, 403))

    def test_other_doctors_package_is_404(self):
        other = make_doctor("drother")
        other_pet = make_pet(other, name="Rex", owner="Ken")
        other_pkg = make_package_invoice(other, other_pet, total_sessions=5)
        resp = self.client.get(f"/api/v1/packages/{other_pkg.id}")
        self.assertEqual(resp.status_code, 404)

    def test_unknown_id_is_404(self):
        resp = self.client.get("/api/v1/packages/999999")
        self.assertEqual(resp.status_code, 404)

    # -- end-to-end decrement via the real /complete hook ----------------
    def _complete(self, appt):
        return self.client.post(f"/api/v1/appointments/{appt.id}/complete")

    def _get_counter(self):
        resp = self.client.get(f"/api/v1/packages/{self.package.id}")
        self.assertEqual(resp.status_code, 200)
        return resp.data

    def test_complete_increments_by_exactly_one(self):
        appt = make_appointment(self.doc, self.pet)
        resp = self._complete(appt)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], Appointment.STATUS_COMPLETED)

        data = self._get_counter()
        self.assertEqual(data["used_sessions"], 1)
        self.assertEqual(data["remaining"], 2)
        self.assertFalse(data["exhausted"])
        self.assertEqual(PackageSessionConsumption.objects.count(), 1)

    def test_recompleting_same_appointment_does_not_double_count(self):
        appt = make_appointment(self.doc, self.pet)
        self._complete(appt)
        self._complete(appt)  # replayed Completed on the SAME appointment
        self._complete(appt)

        data = self._get_counter()
        self.assertEqual(data["used_sessions"], 1)
        self.assertEqual(data["remaining"], 2)
        # Exactly one ledger row for this (package, appointment).
        self.assertEqual(
            PackageSessionConsumption.objects.filter(
                package=self.package, appointment=appt
            ).count(),
            1,
        )

    def test_distinct_appointments_each_consume_one(self):
        a1 = make_appointment(self.doc, self.pet, day="2026-07-20")
        a2 = make_appointment(self.doc, self.pet, day="2026-07-21")
        self._complete(a1)
        self._complete(a2)
        data = self._get_counter()
        self.assertEqual(data["used_sessions"], 2)
        self.assertEqual(data["remaining"], 1)
        self.assertFalse(data["exhausted"])

    def test_counter_never_exceeds_total_and_exhaustion_is_noop(self):
        # 3 distinct completions fill the 3-session package exactly.
        appts = [
            make_appointment(self.doc, self.pet, day=f"2026-07-2{i}")
            for i in range(3)
        ]
        for a in appts:
            self._complete(a)
        data = self._get_counter()
        self.assertEqual(data["used_sessions"], 3)
        self.assertEqual(data["remaining"], 0)
        self.assertTrue(data["exhausted"])

        # A 4th, brand-new completion once exhausted is a no-op: counter stays
        # capped at total, remaining stays 0, and no ledger row is written for it.
        extra = make_appointment(self.doc, self.pet, day="2026-07-25")
        self._complete(extra)
        data = self._get_counter()
        self.assertEqual(data["used_sessions"], 3)
        self.assertEqual(data["remaining"], 0)
        self.assertTrue(data["exhausted"])
        self.assertFalse(
            PackageSessionConsumption.objects.filter(appointment=extra).exists()
        )
        # Never above total.
        self.package.refresh_from_db()
        self.assertLessEqual(self.package.used_sessions, self.package.total_sessions)

    def test_no_package_for_pet_is_harmless(self):
        # An appointment for a pet with no package-mode invoice completes fine
        # and creates no consumption.
        bare_pet = make_pet(self.doc, name="Milo", owner="Sam")
        appt = make_appointment(self.doc, bare_pet)
        resp = self._complete(appt)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(PackageSessionConsumption.objects.count(), 0)
        # The unrelated existing package is untouched.
        self.assertEqual(self._get_counter()["used_sessions"], 0)
