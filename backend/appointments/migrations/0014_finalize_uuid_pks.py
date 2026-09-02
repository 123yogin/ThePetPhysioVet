"""UUID primary key migration — step 3/3 (the actual PK/FK swap).

This is the risky part, and it MUST all happen in one migration (one
schema_editor session) rather than split model-by-model, for a concrete,
verified reason: SQLite's schema editor validates referential integrity
for the *entire database* — via `PRAGMA foreign_key_check` with no table
filter — once at the end of every migration (`schema_editor.__exit__`),
not just the tables that migration touched. If model A's primary key were
promoted to UUID in one migration while a table with an FK pointing at A
were repointed in a later migration, the FIRST migration's own end-of-run
check would already see `child.a_id` (still an old integer) failing to
match any row in the now-UUID-keyed `a.id` column, and the migration would
abort with an IntegrityError. This was reproduced and confirmed against a
throwaway two-model prototype before writing this migration for real.

So every model's own PK promotion (Pass 1) and every FK/O2O repoint
(Pass 2) for the WHOLE app is one migration. Pass 1 must fully precede
Pass 2 because Pass 2's `AlterField` needs to see the *referenced* model's
`id` already declared as the UUID primary key in order to generate a
correctly-typed FK column.

Two tables outside this app also carry a live FK to `UserProfile` and are
NOT migrated via Django operations here (they belong to other apps'
migration state, and Operations cannot cross an app_label boundary): the
SimpleJWT token-blacklist app's `token_blacklist_outstandingtoken` (612
rows in the dev DB — real refresh-token history, not test fixture noise)
and `django_admin_log` (0 rows locally, handled anyway for correctness).
Both get their `user_id` values remapped by raw SQL in
`remap_foreign_app_user_fks` below, in the SAME migration/schema_editor
session, for the exact reason above: the whole-DB constraint check would
otherwise fail on them too. Their *declared* SQLite column type is left as
`integer` — SQLite has no enforced column typing (only affinity), so a
stored UUID string in a nominally "integer" column works correctly for
both storage and every future read/write Django's ORM performs against it
(the ORM's Python-level field/converter logic — driven by `UserProfile`'s
now-UUID pk — governs correctness, not the column's original DDL). Neither
app's own `manage.py makemigrations --check` reports drift from this,
because a ForeignKey's migration state never encodes its target's PK type
in the first place (it's resolved dynamically from the live target model
at schema-application time) — verified live as part of this change's
required `--check --dry-run`.

Each `RemoveField`/`RenameField`/`AlterField` triple below is individually
reversible (Django's migration framework generates the inverse operation
automatically), but a full reverse of this migration is schema-only, not
data-symmetric: the original sequential integer id *values* are gone
(overwritten, not archived) and cannot be restored. This is the same
caveat that applies to reversing any `RemoveField` — expected, not new
risk introduced here.
"""

import uuid

from django.db import migrations, models
import django.db.models.deletion


def remap_foreign_app_user_fks(apps, schema_editor):
    """Repoint the two tables outside this app that FK to UserProfile
    (see module docstring). Runs FIRST, while the old integer
    `userprofile.id` values are still resolvable via `uuid.uuid4()` results
    already stamped onto every row's `uuid` column by 0013.

    IMPORTANT: `new_uuid.hex` (32 lowercase hex chars, no dashes), NOT
    `str(new_uuid)` (which inserts dashes). SQLite has no native UUID type;
    Django's `UUIDField` stores values on it as the bare 32-char hex form
    (see `UUIDField.get_db_prep_value` — `has_native_uuid_field` is False
    for SQLite), which is exactly what `RenameField`/`AlterField` below
    carry forward untouched for every in-app FK. A raw SQL write from here
    using the hyphenated `str()` form would silently mismatch that stored
    representation — same UUID, different bytes on disk — and the
    end-of-migration `PRAGMA foreign_key_check` would (correctly) flag it
    as a foreign key pointing nowhere. Caught by actually running this
    migration against a copy of the dev database, not by inspection.
    """
    UserProfile = apps.get_model("appointments", "UserProfile")
    user_map = {
        old_id: new_uuid.hex
        for old_id, new_uuid in UserProfile.objects.values_list("id", "uuid")
    }

    with schema_editor.connection.cursor() as cursor:
        for table in ("token_blacklist_outstandingtoken", "django_admin_log"):
            cursor.execute(
                f"SELECT DISTINCT user_id FROM {table} WHERE user_id IS NOT NULL"
            )
            old_ids = [row[0] for row in cursor.fetchall()]
            for old_id in old_ids:
                new_uuid = user_map.get(old_id)
                if new_uuid is not None:
                    cursor.execute(
                        f"UPDATE {table} SET user_id = %s WHERE user_id = %s",
                        [new_uuid, old_id],
                    )


def noop_reverse(apps, schema_editor):
    # See module docstring: not data-reversible past this point.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0013_populate_uuid_fields"),
        # `remap_foreign_app_user_fks` above reads/writes
        # `token_blacklist_outstandingtoken` and `django_admin_log` directly
        # by raw SQL — both tables must already exist. Without an explicit
        # dependency, Django's migration executor has no reason to order
        # this migration after those two apps' own migrations on a FRESH
        # database (the existing dev DB happened to already have both
        # tables from prior `migrate` runs, which is exactly why this only
        # surfaced when actually testing a from-zero migrate, per this
        # change's required verification step).
        ("token_blacklist", "0013_alter_blacklistedtoken_options_and_more"),
        ("admin", "0003_logentry_add_action_flag_choices"),
    ]

    operations = [
        migrations.RunPython(remap_foreign_app_user_fks, noop_reverse),

        # --- Pass 1: promote every model's `uuid` helper to be the real primary key ---
        migrations.RemoveField("userprofile", "id"),
        migrations.RenameField("userprofile", "uuid", "id"),
        migrations.AlterField(
            "userprofile", "id",
            field=models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False),
        ),
        migrations.RemoveField("pet", "id"),
        migrations.RenameField("pet", "uuid", "id"),
        migrations.AlterField(
            "pet", "id",
            field=models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False),
        ),
        migrations.RemoveField("appointment", "id"),
        migrations.RenameField("appointment", "uuid", "id"),
        migrations.AlterField(
            "appointment", "id",
            field=models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False),
        ),
        migrations.RemoveField("diagnosticreport", "id"),
        migrations.RenameField("diagnosticreport", "uuid", "id"),
        migrations.AlterField(
            "diagnosticreport", "id",
            field=models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False),
        ),
        migrations.RemoveField("treatmentplan", "id"),
        migrations.RenameField("treatmentplan", "uuid", "id"),
        migrations.AlterField(
            "treatmentplan", "id",
            field=models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False),
        ),
        migrations.RemoveField("progressnote", "id"),
        migrations.RenameField("progressnote", "uuid", "id"),
        migrations.AlterField(
            "progressnote", "id",
            field=models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False),
        ),
        migrations.RemoveField("invoice", "id"),
        migrations.RenameField("invoice", "uuid", "id"),
        migrations.AlterField(
            "invoice", "id",
            field=models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False),
        ),
        migrations.RemoveField("lineitem", "id"),
        migrations.RenameField("lineitem", "uuid", "id"),
        migrations.AlterField(
            "lineitem", "id",
            field=models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False),
        ),
        migrations.RemoveField("payment", "id"),
        migrations.RenameField("payment", "uuid", "id"),
        migrations.AlterField(
            "payment", "id",
            field=models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False),
        ),
        migrations.RemoveField("package", "id"),
        migrations.RenameField("package", "uuid", "id"),
        migrations.AlterField(
            "package", "id",
            field=models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False),
        ),
        migrations.RemoveField("notification", "id"),
        migrations.RenameField("notification", "uuid", "id"),
        migrations.AlterField(
            "notification", "id",
            field=models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False),
        ),
        migrations.RemoveField("notificationpref", "id"),
        migrations.RenameField("notificationpref", "uuid", "id"),
        migrations.AlterField(
            "notificationpref", "id",
            field=models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False),
        ),
        migrations.RemoveField("querythread", "id"),
        migrations.RenameField("querythread", "uuid", "id"),
        migrations.AlterField(
            "querythread", "id",
            field=models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False),
        ),
        migrations.RemoveField("querymessage", "id"),
        migrations.RenameField("querymessage", "uuid", "id"),
        migrations.AlterField(
            "querymessage", "id",
            field=models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False),
        ),
        migrations.RemoveField("queryattachment", "id"),
        migrations.RenameField("queryattachment", "uuid", "id"),
        migrations.AlterField(
            "queryattachment", "id",
            field=models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False),
        ),
        migrations.RemoveField("passwordresettoken", "id"),
        migrations.RenameField("passwordresettoken", "uuid", "id"),
        migrations.AlterField(
            "passwordresettoken", "id",
            field=models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False),
        ),

        # --- Pass 2: repoint every FK/O2O at the now-UUID primary keys ---
        migrations.RemoveField("pet", "owner"),
        migrations.RenameField("pet", "owner_uuid", "owner"),
        migrations.AlterField(
            "pet", "owner",
            field=models.ForeignKey(
                null=True, blank=True, on_delete=django.db.models.deletion.SET_NULL, related_name="pets",
                to="appointments.userprofile",
            ),
        ),
        migrations.RemoveField("pet", "doctor"),
        migrations.RenameField("pet", "doctor_uuid", "doctor"),
        migrations.AlterField(
            "pet", "doctor",
            field=models.ForeignKey(
                null=True, blank=True, on_delete=django.db.models.deletion.SET_NULL, related_name="assigned_pets",
                to="appointments.userprofile",
            ),
        ),
        migrations.RemoveField("appointment", "pet"),
        migrations.RenameField("appointment", "pet_uuid", "pet"),
        migrations.AlterField(
            "appointment", "pet",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE, related_name="appointments",
                to="appointments.pet",
            ),
        ),
        migrations.RemoveField("appointment", "doctor"),
        migrations.RenameField("appointment", "doctor_uuid", "doctor"),
        migrations.AlterField(
            "appointment", "doctor",
            field=models.ForeignKey(
                null=True, blank=True, on_delete=django.db.models.deletion.SET_NULL, related_name="appointments",
                to="appointments.userprofile",
            ),
        ),
        migrations.RemoveField("diagnosticreport", "pet"),
        migrations.RenameField("diagnosticreport", "pet_uuid", "pet"),
        migrations.AlterField(
            "diagnosticreport", "pet",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE, related_name="diagnostic_reports",
                to="appointments.pet",
            ),
        ),
        migrations.RemoveField("treatmentplan", "pet"),
        migrations.RenameField("treatmentplan", "pet_uuid", "pet"),
        migrations.AlterField(
            "treatmentplan", "pet",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE, related_name="treatment_plans",
                to="appointments.pet",
            ),
        ),
        migrations.RemoveField("progressnote", "plan"),
        migrations.RenameField("progressnote", "plan_uuid", "plan"),
        migrations.AlterField(
            "progressnote", "plan",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE, related_name="progress_notes",
                to="appointments.treatmentplan",
            ),
        ),
        migrations.RemoveField("invoice", "pet"),
        migrations.RenameField("invoice", "pet_uuid", "pet"),
        migrations.AlterField(
            "invoice", "pet",
            field=models.ForeignKey(
                null=True, blank=True, on_delete=django.db.models.deletion.SET_NULL, related_name="invoices",
                to="appointments.pet",
            ),
        ),
        migrations.RemoveField("invoice", "owner"),
        migrations.RenameField("invoice", "owner_uuid", "owner"),
        migrations.AlterField(
            "invoice", "owner",
            field=models.ForeignKey(
                null=True, blank=True, on_delete=django.db.models.deletion.SET_NULL, related_name="invoices",
                to="appointments.userprofile",
            ),
        ),
        migrations.RemoveField("lineitem", "invoice"),
        migrations.RenameField("lineitem", "invoice_uuid", "invoice"),
        migrations.AlterField(
            "lineitem", "invoice",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE, related_name="line_items",
                to="appointments.invoice",
            ),
        ),
        migrations.RemoveField("payment", "invoice"),
        migrations.RenameField("payment", "invoice_uuid", "invoice"),
        migrations.AlterField(
            "payment", "invoice",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE, related_name="payments",
                to="appointments.invoice",
            ),
        ),
        migrations.RemoveField("package", "invoice"),
        migrations.RenameField("package", "invoice_uuid", "invoice"),
        migrations.AlterField(
            "package", "invoice",
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.CASCADE, related_name="package",
                to="appointments.invoice",
            ),
        ),
        migrations.RemoveField("notification", "user"),
        migrations.RenameField("notification", "user_uuid", "user"),
        migrations.AlterField(
            "notification", "user",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE, related_name="notifications",
                to="appointments.userprofile",
            ),
        ),
        migrations.RemoveField("querythread", "pet"),
        migrations.RenameField("querythread", "pet_uuid", "pet"),
        migrations.AlterField(
            "querythread", "pet",
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.CASCADE, related_name="query_thread",
                to="appointments.pet",
            ),
        ),
        migrations.RemoveField("querymessage", "thread"),
        migrations.RenameField("querymessage", "thread_uuid", "thread"),
        migrations.AlterField(
            "querymessage", "thread",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE, related_name="messages",
                to="appointments.querythread",
            ),
        ),
        migrations.RemoveField("querymessage", "sender"),
        migrations.RenameField("querymessage", "sender_uuid", "sender"),
        migrations.AlterField(
            "querymessage", "sender",
            field=models.ForeignKey(
                null=True, blank=True, on_delete=django.db.models.deletion.SET_NULL, related_name="query_messages",
                to="appointments.userprofile",
            ),
        ),
        migrations.RemoveField("queryattachment", "message"),
        migrations.RenameField("queryattachment", "message_uuid", "message"),
        migrations.AlterField(
            "queryattachment", "message",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE, related_name="attachments",
                to="appointments.querymessage",
            ),
        ),
        migrations.RemoveField("passwordresettoken", "user"),
        migrations.RenameField("passwordresettoken", "user_uuid", "user"),
        migrations.AlterField(
            "passwordresettoken", "user",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE, related_name="password_reset_tokens",
                to="appointments.userprofile",
            ),
        ),
    ]
