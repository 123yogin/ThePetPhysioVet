"""UUID primary key migration — step 1/3.

Adds a nullable `uuid` helper column to every model (to become the new
primary key) and a nullable `<fk>_uuid` helper column for every foreign key
/ one-to-one field (to become the new FK, pointed at the related row's
`uuid`). Nothing is populated yet — see 0013. Nothing is removed or
repointed yet — see 0014. This mirrors the standard Django "migrate an
integer PK to UUID" recipe (add -> populate -> swap), which is required
because Django cannot alter a PK's type in place while other tables still
hold FKs pointing at it.

Deliberately NOT setting `default=uuid.uuid4` at the field-add step: SQLite
`ALTER TABLE ADD COLUMN ... DEFAULT <value>` evaluates a Python callable
default exactly ONCE and stamps every existing row with the SAME value,
which would make every row's `uuid` identical (a straight uniqueness bug on
what is about to become a primary key). 0013 backfills a genuinely distinct
value per row instead.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0011_passwordresettoken"),
    ]

    operations = [
        migrations.AddField("userprofile", "uuid", models.UUIDField(null=True, editable=False)),
        migrations.AddField("pet", "uuid", models.UUIDField(null=True, editable=False)),
        migrations.AddField("appointment", "uuid", models.UUIDField(null=True, editable=False)),
        migrations.AddField("diagnosticreport", "uuid", models.UUIDField(null=True, editable=False)),
        migrations.AddField("treatmentplan", "uuid", models.UUIDField(null=True, editable=False)),
        migrations.AddField("progressnote", "uuid", models.UUIDField(null=True, editable=False)),
        migrations.AddField("invoice", "uuid", models.UUIDField(null=True, editable=False)),
        migrations.AddField("lineitem", "uuid", models.UUIDField(null=True, editable=False)),
        migrations.AddField("payment", "uuid", models.UUIDField(null=True, editable=False)),
        migrations.AddField("package", "uuid", models.UUIDField(null=True, editable=False)),
        migrations.AddField("notification", "uuid", models.UUIDField(null=True, editable=False)),
        migrations.AddField("notificationpref", "uuid", models.UUIDField(null=True, editable=False)),
        migrations.AddField("querythread", "uuid", models.UUIDField(null=True, editable=False)),
        migrations.AddField("querymessage", "uuid", models.UUIDField(null=True, editable=False)),
        migrations.AddField("queryattachment", "uuid", models.UUIDField(null=True, editable=False)),
        migrations.AddField("passwordresettoken", "uuid", models.UUIDField(null=True, editable=False)),
        migrations.AddField("pet", "owner_uuid", models.UUIDField(null=True)),
        migrations.AddField("pet", "doctor_uuid", models.UUIDField(null=True)),
        migrations.AddField("appointment", "pet_uuid", models.UUIDField(null=True)),
        migrations.AddField("appointment", "doctor_uuid", models.UUIDField(null=True)),
        migrations.AddField("diagnosticreport", "pet_uuid", models.UUIDField(null=True)),
        migrations.AddField("treatmentplan", "pet_uuid", models.UUIDField(null=True)),
        migrations.AddField("progressnote", "plan_uuid", models.UUIDField(null=True)),
        migrations.AddField("invoice", "pet_uuid", models.UUIDField(null=True)),
        migrations.AddField("invoice", "owner_uuid", models.UUIDField(null=True)),
        migrations.AddField("lineitem", "invoice_uuid", models.UUIDField(null=True)),
        migrations.AddField("payment", "invoice_uuid", models.UUIDField(null=True)),
        migrations.AddField("package", "invoice_uuid", models.UUIDField(null=True)),
        migrations.AddField("notification", "user_uuid", models.UUIDField(null=True)),
        migrations.AddField("querythread", "pet_uuid", models.UUIDField(null=True)),
        migrations.AddField("querymessage", "thread_uuid", models.UUIDField(null=True)),
        migrations.AddField("querymessage", "sender_uuid", models.UUIDField(null=True)),
        migrations.AddField("queryattachment", "message_uuid", models.UUIDField(null=True)),
        migrations.AddField("passwordresettoken", "user_uuid", models.UUIDField(null=True)),
    ]
