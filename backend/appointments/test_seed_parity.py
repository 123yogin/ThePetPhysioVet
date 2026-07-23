"""Tests for the deterministic parity seed (manage.py seed_parity).

Run with:  ./.venv/bin/python manage.py test appointments.test_seed_parity

Verifies the canonical dataset materialises with the documented row counts /
ordering and that running the command twice is idempotent (byte-identical rows,
fixed primary keys), so the Django pages and the React fixture stay in lock-step.
"""

import datetime

from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse

from .models import Appointment, DoctorProfile, Pet

ANCHOR = datetime.date(2026, 7, 22)
PAST = datetime.date(2026, 7, 20)


def _snapshot():
    """A hashable snapshot of every parity row, for idempotency comparison."""
    pets = [
        (p.id, p.name, p.pet_type, p.owner_name, p.owner_phone, p.notes)
        for p in Pet.objects.order_by("id")
    ]
    appts = [
        (a.id, a.pet_id, a.visit_type, a.date, a.time, a.status)
        for a in Appointment.objects.order_by("id")
    ]
    return pets, appts


class SeedParityTests(TestCase):
    def setUp(self):
        call_command("seed_parity")
        self.doctor = User.objects.get(username="drmeadow")

    def test_doctor_and_profile(self):
        self.assertFalse(self.doctor.is_superuser)
        self.assertEqual(self.doctor.email, "vet@petphysio.test")
        self.assertEqual(self.doctor.first_name, "Ava")
        self.assertTrue(hasattr(self.doctor, "doctor_profile"))
        self.assertEqual(self.doctor.doctor_profile.clinic_name, "Meadow Physio Clinic")

    def test_doctor_can_log_in(self):
        self.assertTrue(self.client.login(username="drmeadow", password="MeadowPhysio!2026"))

    def test_pets_ids_and_ordering(self):
        pets = list(Pet.objects.order_by("id"))
        self.assertEqual([p.id for p in pets], [1, 2, 3])
        # Pet.Meta orders by name -> patients list is Biscuit, Mittens, Rocky.
        self.assertEqual(
            [p.name for p in Pet.objects.all()], ["Biscuit", "Mittens", "Rocky"]
        )

    def test_appointment_id_1_is_reschedule_target(self):
        a = Appointment.objects.get(id=1)
        self.assertEqual(a.pet.name, "Biscuit")
        self.assertEqual(a.date, ANCHOR)
        self.assertEqual(a.time, datetime.time(9, 30))
        self.assertEqual(a.status, Appointment.STATUS_PENDING)

    def test_dashboard_row_counts(self):
        today_qs = (
            Appointment.objects.filter(doctor=self.doctor, date=ANCHOR)
            .exclude(status=Appointment.STATUS_COMPLETED)
            .order_by("time", "id")
        )
        self.assertEqual([a.pet.name for a in today_qs], ["Biscuit", "Mittens", "Rocky"])
        completed = Appointment.objects.filter(
            doctor=self.doctor, status=Appointment.STATUS_COMPLETED
        ).count()
        self.assertEqual(completed, 1)

    def test_appointments_list_order(self):
        qs = Appointment.objects.filter(doctor=self.doctor).order_by("-date", "-time", "-id")
        self.assertEqual([a.id for a in qs], [3, 2, 1, 4])

    def test_appointments_filter_biscuit(self):
        qs = (
            Appointment.objects.filter(doctor=self.doctor, pet__name__icontains="Biscuit")
            .order_by("-date", "-time", "-id")
        )
        self.assertEqual([a.id for a in qs], [1, 4])

    def test_patients_count(self):
        self.assertEqual(Pet.objects.filter(doctor=self.doctor).count(), 3)

    def test_idempotent(self):
        before = _snapshot()
        call_command("seed_parity")
        after = _snapshot()
        self.assertEqual(before, after)
        # No duplicate doctor / profile rows.
        self.assertEqual(User.objects.filter(username="drmeadow").count(), 1)
        self.assertEqual(DoctorProfile.objects.filter(user=self.doctor).count(), 1)
        self.assertEqual(Pet.objects.filter(doctor=self.doctor).count(), 3)
        self.assertEqual(Appointment.objects.filter(doctor=self.doctor).count(), 4)


class ParityShellRouteTests(TestCase):
    """The parity shell route is only registered under PARITY_MODE."""

    def test_route_absent_by_default(self):
        from django.urls import NoReverseMatch

        with self.assertRaises(NoReverseMatch):
            reverse("parity_shell")
