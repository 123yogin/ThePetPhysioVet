"""Deterministic parity seed.

Materialises ONE canonical, internally-consistent dataset (doctor + pets +
appointments) so the Django-rendered pages and the React SPA render byte-
identical rows on every run. The exact same spec is mirrored row-for-row in the
React fixture at ``clients/web/src/mock/data.ts``.

Run with::

    ./.venv/bin/python manage.py seed_parity

Idempotent: it wipes the parity doctor's Pets + Appointments and re-inserts
them with explicit primary keys in a fixed order, so two consecutive runs
produce byte-identical rows (pet ids 1..3, appointment ids 1..4, with
appointment id 1 = Biscuit / today / 09:30 / Pending).

The "today" anchor is read from ``settings.PARITY_TODAY`` (env ``PARITY_TODAY``)
and falls back to 2026-07-22 so the seed and the React fixture agree on which
rows land on "today".
"""

import datetime

from django.conf import settings
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction

from appointments.models import Appointment, DoctorProfile, Pet

# Canonical parity doctor.
DOCTOR_USERNAME = "drmeadow"
DOCTOR_EMAIL = "vet@petphysio.test"
DOCTOR_FIRST = "Ava"
DOCTOR_LAST = "Meadow"
DOCTOR_PASSWORD = "MeadowPhysio!2026"
CLINIC_NAME = "Meadow Physio Clinic"
CLINIC_ADDRESS = "48 Green Avenue, Bengaluru 560001"
CLINIC_PHONE = "+91 80 4123 5678"

# Fallback anchor date (kept in sync with the React fixture's MOCK_TODAY).
DEFAULT_TODAY = datetime.date(2026, 7, 22)
PAST_DATE = datetime.date(2026, 7, 20)


class Command(BaseCommand):
    help = "Seed the canonical, deterministic parity dataset (doctor + pets + appointments)."

    @transaction.atomic
    def handle(self, *args, **options):
        today = getattr(settings, "PARITY_TODAY", None) or DEFAULT_TODAY

        # --- Doctor + profile (idempotent) -------------------------------
        user, _ = User.objects.get_or_create(
            username=DOCTOR_USERNAME,
            defaults={"email": DOCTOR_EMAIL},
        )
        user.email = DOCTOR_EMAIL
        user.first_name = DOCTOR_FIRST
        user.last_name = DOCTOR_LAST
        user.is_superuser = False
        user.is_staff = False
        user.is_active = True
        user.set_password(DOCTOR_PASSWORD)
        user.save()

        DoctorProfile.objects.update_or_create(
            user=user,
            defaults={
                "clinic_name": CLINIC_NAME,
                "clinic_address": CLINIC_ADDRESS,
                "clinic_phone": CLINIC_PHONE,
            },
        )

        # --- Wipe this doctor's data so re-runs are byte-identical --------
        Appointment.objects.filter(doctor=user).delete()
        Pet.objects.filter(doctor=user).delete()

        # --- Pets (explicit ids -> ordered Biscuit, Mittens, Rocky) -------
        # Pet.Meta orders by name, so the patients list renders alphabetically:
        # Biscuit, Mittens, Rocky.
        pets_spec = [
            (1, "Biscuit", "Dog", "Priya Sharma", "+91 98765 43210",
             "Post-op cruciate ligament rehab."),
            (2, "Mittens", "Cat", "Rahul Verma", "+91 91234 56789",
             ""),
            (3, "Rocky", "Dog", "Neha Gupta", "+91 99887 76655",
             "Hip dysplasia, hydrotherapy plan."),
        ]
        pets = {}
        for pk, name, pet_type, owner_name, owner_phone, notes in pets_spec:
            pets[name] = Pet.objects.create(
                id=pk,
                doctor=user,
                name=name,
                pet_type=pet_type,
                owner_name=owner_name,
                owner_phone=owner_phone,
                notes=notes,
            )

        # --- Appointments (explicit ids; id 1 is the reschedule/share target)
        appts_spec = [
            (1, "Biscuit", today, datetime.time(9, 30), Appointment.VISIT_CLINIC,
             Appointment.STATUS_PENDING),
            (2, "Mittens", today, datetime.time(11, 0), Appointment.VISIT_HOME,
             Appointment.STATUS_RESCHEDULED),
            (3, "Rocky", today, datetime.time(14, 15), Appointment.VISIT_CLINIC,
             Appointment.STATUS_PENDING),
            (4, "Biscuit", PAST_DATE, datetime.time(9, 30), Appointment.VISIT_CLINIC,
             Appointment.STATUS_COMPLETED),
        ]
        for pk, pet_name, date, time, visit_type, appt_status in appts_spec:
            Appointment.objects.create(
                id=pk,
                doctor=user,
                pet=pets[pet_name],
                visit_type=visit_type,
                date=date,
                time=time,
                reason_notes="",
                status=appt_status,
            )

        self.stdout.write(self.style.SUCCESS(
            f"Seeded parity dataset for '{DOCTOR_USERNAME}' anchored at {today.isoformat()}: "
            f"{Pet.objects.filter(doctor=user).count()} pets, "
            f"{Appointment.objects.filter(doctor=user).count()} appointments."
        ))
