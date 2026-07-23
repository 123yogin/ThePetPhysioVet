"""DPDP (SRS §4) — owner data portability & erasure.

Access or erase all personal data tied to an owner (identified by phone), per the
Indian DPDP Act's right-to-access and right-to-erasure. Admin-run:

    manage.py owner_data export --phone "+91..."   # -> JSON of everything on file
    manage.py owner_data delete --phone "+91..."   # -> erase it all + audit the erasure
"""
import json

from django.core.management.base import BaseCommand, CommandError
from django.core.exceptions import FieldError
from django.db import transaction

from appointments import models as m
from appointments.audit import record_event


def _model(name):
    return getattr(m, name, None)


def _by_pet(Mdl, pets):
    """Rows of Mdl linked to these pets, tolerating models without a `pet` FK."""
    if not Mdl or not pets.exists():
        return []
    try:
        return list(Mdl.objects.filter(pet__in=pets).values())
    except FieldError:
        return []


class Command(BaseCommand):
    help = "DPDP owner data export/erasure by owner phone (SRS §4)."

    def add_arguments(self, parser):
        parser.add_argument("action", choices=["export", "delete"])
        parser.add_argument("--phone", required=True, help="Owner phone (as stored on the pet record)")

    def _collect(self, phone):
        pets = m.Pet.objects.filter(owner_phone=phone)
        data = {"owner_phone": phone, "pets": list(pets.values())}
        for key, name in (
            ("appointments", "Appointment"), ("diagnoses", "Diagnosis"),
            ("treatment_plans", "TreatmentPlan"), ("invoices", "Invoice"),
            ("queries", "Query"),
        ):
            data[key] = _by_pet(_model(name), pets)
        Pref = _model("NotificationPref")
        data["notification_prefs"] = (
            list(Pref.objects.filter(owner_phone=phone).values()) if Pref else []
        )
        return pets, data

    def handle(self, *args, **opts):
        phone, action = opts["phone"], opts["action"]
        pets, data = self._collect(phone)

        if action == "export":
            # default=str serialises datetimes / Decimals losslessly for the export.
            self.stdout.write(json.dumps(data, indent=2, default=str))
            return

        counts = {k: len(v) for k, v in data.items() if isinstance(v, list)}
        if not any(counts.values()):
            raise CommandError(f"No data found for owner phone {phone!r}")

        with transaction.atomic():
            Pref = _model("NotificationPref")
            if Pref:
                Pref.objects.filter(owner_phone=phone).delete()
            pets.delete()  # cascades appointments / diagnoses / treatment plans / invoices / queries
            record_event(
                None, m.AuditLog.DELETE, "dpdp_erasure",
                method="CMD", path=f"owner_data delete {phone}", status_code=200,
            )
        self.stderr.write(f"DPDP erasure complete for {phone}: {counts}")
