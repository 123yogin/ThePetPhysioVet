from django.db import migrations

# Mirrors Appointment.VISIT_TYPES on the live model. Kept as a plain dict here
# (rather than importing the model) because historical migration models only
# expose fields, not custom class attributes.
VISIT_TYPE_DISPLAY = {
    "Initial": "Initial Consultation",
    "Followup": "Follow-up Session",
    "Reassessment": "Re-assessment",
    "Hydrotherapy": "Hydrotherapy",
    "LaserTherapy": "Laser Therapy",
}


def backfill_visit_type_display(apps, schema_editor):
    """B5 fix: `visit_type_display` was a stored column that defaulted to
    "Initial Consultation" and was never written by the API (read_only in
    the serializer, only ever set by seed_data). Every appointment booked
    through the API — regardless of its real `visit_type` — displayed
    "Initial Consultation". Going forward `AppointmentSerializer.create`
    derives it from `visit_type`; this migration corrects existing rows the
    same way.
    """
    Appointment = apps.get_model("appointments", "Appointment")
    for code, label in VISIT_TYPE_DISPLAY.items():
        Appointment.objects.filter(visit_type=code).exclude(
            visit_type_display=label
        ).update(visit_type_display=label)


def noop_reverse(apps, schema_editor):
    # Not meaningful to "unbackfill" a display-string correction.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0008_extend_visit_types"),
    ]

    operations = [
        migrations.RunPython(backfill_visit_type_display, noop_reverse),
    ]
