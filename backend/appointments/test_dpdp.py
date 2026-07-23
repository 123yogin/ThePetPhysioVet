"""Sprint 8 (SRS §4 / DPDP): owner data export + erasure."""
import json
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from appointments.models import Appointment, Pet

PHONE = "+919999900001"


class DPDPCommandTest(TestCase):
    def setUp(self):
        self.doctor = get_user_model().objects.create_user(
            username="dpdpdoc", email="dpdp@example.com", password="Passw0rd!23"
        )
        self.pet = Pet.objects.create(
            doctor=self.doctor, name="Biscuit", pet_type="Dog",
            owner_name="R. Sharma", owner_phone=PHONE,
        )
        Appointment.objects.create(
            doctor=self.doctor, pet=self.pet, date="2026-07-24", time="10:30",
        )

    def test_export_returns_owner_data(self):
        out = StringIO()
        call_command("owner_data", "export", "--phone", PHONE, stdout=out)
        data = json.loads(out.getvalue())
        self.assertEqual(data["owner_phone"], PHONE)
        self.assertEqual(len(data["pets"]), 1)
        self.assertEqual(len(data["appointments"]), 1)
        self.assertEqual(data["pets"][0]["owner_name"], "R. Sharma")

    def test_delete_erases_and_cascades(self):
        call_command("owner_data", "delete", "--phone", PHONE, stderr=StringIO())
        self.assertEqual(Pet.objects.filter(owner_phone=PHONE).count(), 0)
        # deleting the pet cascades to its appointments
        self.assertEqual(Appointment.objects.count(), 0)

    def test_delete_unknown_owner_raises(self):
        with self.assertRaises(CommandError):
            call_command("owner_data", "delete", "--phone", "+910000000000", stderr=StringIO())
