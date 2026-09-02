"""UUID primary key migration — step 2/3.

Backfills the helper columns added in 0012:
  1. Every model's `uuid` gets a genuinely distinct `uuid.uuid4()` per row.
  2. Every `<fk>_uuid` helper is set to the *related row's* new `uuid`,
     resolved via the *existing* integer FK (still intact at this point —
     nothing is removed or repointed until 0014).

This is a pure data migration; no column is dropped, renamed, or retyped
here, so it carries no referential-integrity risk on SQLite (see 0014's
docstring for why that risk is real and why the actual PK/FK swap has to
happen in one single migration).
"""

import uuid

from django.db import migrations


def _populate_own_uuid(model):
    """Assign a distinct uuid4 to every row of `model`. Returns {old_id: uuid}."""
    mapping = {}
    rows = list(model.objects.all())
    for row in rows:
        new_uuid = uuid.uuid4()
        row.uuid = new_uuid
        mapping[row.pk] = new_uuid
    model.objects.bulk_update(rows, ["uuid"], batch_size=500)
    return mapping


def _populate_fk_uuid(model, fk_attname, fk_uuid_field, target_map):
    """Set `<fk_uuid_field>` on every row of `model` from `target_map`,
    keyed by the existing integer FK id (`<fk_attname>_id`).
    """
    rows = list(model.objects.all())
    changed = []
    for row in rows:
        old_target_id = getattr(row, f"{fk_attname}_id")
        if old_target_id is not None:
            setattr(row, fk_uuid_field, target_map.get(old_target_id))
            changed.append(row)
    if changed:
        model.objects.bulk_update(changed, [fk_uuid_field], batch_size=500)


def populate(apps, schema_editor):
    UserProfile = apps.get_model("appointments", "UserProfile")
    Pet = apps.get_model("appointments", "Pet")
    Appointment = apps.get_model("appointments", "Appointment")
    DiagnosticReport = apps.get_model("appointments", "DiagnosticReport")
    TreatmentPlan = apps.get_model("appointments", "TreatmentPlan")
    ProgressNote = apps.get_model("appointments", "ProgressNote")
    Invoice = apps.get_model("appointments", "Invoice")
    LineItem = apps.get_model("appointments", "LineItem")
    Payment = apps.get_model("appointments", "Payment")
    Package = apps.get_model("appointments", "Package")
    Notification = apps.get_model("appointments", "Notification")
    NotificationPref = apps.get_model("appointments", "NotificationPref")
    QueryThread = apps.get_model("appointments", "QueryThread")
    QueryMessage = apps.get_model("appointments", "QueryMessage")
    QueryAttachment = apps.get_model("appointments", "QueryAttachment")
    PasswordResetToken = apps.get_model("appointments", "PasswordResetToken")

    # 1. Every model's own uuid, and remember the old-id -> uuid mapping for
    #    models that other models have FKs to.
    user_map = _populate_own_uuid(UserProfile)
    pet_map = _populate_own_uuid(Pet)
    _populate_own_uuid(Appointment)
    _populate_own_uuid(DiagnosticReport)
    plan_map = _populate_own_uuid(TreatmentPlan)
    _populate_own_uuid(ProgressNote)
    invoice_map = _populate_own_uuid(Invoice)
    _populate_own_uuid(LineItem)
    _populate_own_uuid(Payment)
    _populate_own_uuid(Package)
    _populate_own_uuid(Notification)
    _populate_own_uuid(NotificationPref)
    thread_map = _populate_own_uuid(QueryThread)
    message_map = _populate_own_uuid(QueryMessage)
    _populate_own_uuid(QueryAttachment)
    _populate_own_uuid(PasswordResetToken)

    # 2. Every FK/O2O helper column, resolved via the still-intact integer FK.
    _populate_fk_uuid(Pet, "owner", "owner_uuid", user_map)
    _populate_fk_uuid(Pet, "doctor", "doctor_uuid", user_map)
    _populate_fk_uuid(Appointment, "pet", "pet_uuid", pet_map)
    _populate_fk_uuid(Appointment, "doctor", "doctor_uuid", user_map)
    _populate_fk_uuid(DiagnosticReport, "pet", "pet_uuid", pet_map)
    _populate_fk_uuid(TreatmentPlan, "pet", "pet_uuid", pet_map)
    _populate_fk_uuid(ProgressNote, "plan", "plan_uuid", plan_map)
    _populate_fk_uuid(Invoice, "pet", "pet_uuid", pet_map)
    _populate_fk_uuid(Invoice, "owner", "owner_uuid", user_map)
    _populate_fk_uuid(LineItem, "invoice", "invoice_uuid", invoice_map)
    _populate_fk_uuid(Payment, "invoice", "invoice_uuid", invoice_map)
    _populate_fk_uuid(Package, "invoice", "invoice_uuid", invoice_map)
    _populate_fk_uuid(Notification, "user", "user_uuid", user_map)
    _populate_fk_uuid(QueryThread, "pet", "pet_uuid", pet_map)
    _populate_fk_uuid(QueryMessage, "thread", "thread_uuid", thread_map)
    _populate_fk_uuid(QueryMessage, "sender", "sender_uuid", user_map)
    _populate_fk_uuid(QueryAttachment, "message", "message_uuid", message_map)
    _populate_fk_uuid(PasswordResetToken, "user", "user_uuid", user_map)


def noop_reverse(apps, schema_editor):
    # Nothing to unbackfill — the helper columns are dropped by reversing
    # 0012, which this migration depends on.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0012_add_uuid_fields"),
    ]

    operations = [
        migrations.RunPython(populate, noop_reverse),
    ]
