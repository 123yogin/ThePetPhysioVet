import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    """Tighten constraints now that 0003 has backfilled data, and drop the
    fields/models the target data model no longer needs.
    """

    dependencies = [
        ("appointments", "0003_backfill_ownership"),
    ]

    operations = [
        # Appointment.pet is required in the target model — existing rows
        # are already all non-null (verified against the dev DB).
        migrations.AlterField(
            model_name="appointment",
            name="pet",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="appointments", to="appointments.pet"),
        ),

        # invoice_no is now populated for every row — make it required+unique.
        migrations.AlterField(
            model_name="invoice",
            name="invoice_no",
            field=models.CharField(max_length=50, unique=True),
        ),

        # Drop the legacy flat fields Invoice used before it had pet/owner FKs.
        migrations.RemoveField(model_name="invoice", name="invoice_number"),
        migrations.RemoveField(model_name="invoice", name="pet_name"),
        migrations.RemoveField(model_name="invoice", name="owner_name"),
        migrations.RemoveField(model_name="invoice", name="owner_email"),
        migrations.RemoveField(model_name="invoice", name="owner_phone"),
        migrations.RemoveField(model_name="invoice", name="date"),
        migrations.RemoveField(model_name="invoice", name="due_date"),
        migrations.RemoveField(model_name="invoice", name="status"),
        migrations.RemoveField(model_name="invoice", name="notes"),

        # Drop the old free-text TreatmentPlan fields (no structured mapping
        # exists from free text to the new `therapies` list — the single
        # pre-existing demo row loses these text values on migrate).
        migrations.RemoveField(model_name="treatmentplan", name="goals"),
        migrations.RemoveField(model_name="treatmentplan", name="exercises"),
        migrations.RemoveField(model_name="treatmentplan", name="modalities"),
        migrations.RemoveField(model_name="treatmentplan", name="precautions"),
        migrations.RemoveField(model_name="treatmentplan", name="appointment"),

        # Drop the JSON attachments blob now that QueryAttachment is a real model.
        migrations.RemoveField(model_name="querymessage", name="attachments"),

        # Drop the old free-text Diagnosis model — replaced by DiagnosticReport.
        migrations.DeleteModel(name="Diagnosis"),
    ]
