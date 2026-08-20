import datetime

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    """Schema-only step of the target data model reshape (API_CONTRACT.md §1).

    New ownership FKs and new models are added here as NULLABLE so that
    0003_backfill_ownership (a data migration) can populate them from
    existing data before 0004_finalize_reshape tightens constraints and
    drops now-obsolete fields/models.
    """

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("appointments", "0001_initial"),
    ]

    operations = [
        # --- Pet ownership FKs ---------------------------------------
        migrations.AddField(
            model_name="pet",
            name="owner",
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="pets", to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="pet",
            name="doctor",
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="assigned_pets", to=settings.AUTH_USER_MODEL,
            ),
        ),

        # --- Appointment ownership FK + required pet ------------------
        migrations.AddField(
            model_name="appointment",
            name="doctor",
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="appointments", to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="appointment",
            name="status",
            field=models.CharField(
                choices=[
                    ("Confirmed", "Confirmed"), ("Completed", "Completed"),
                    ("Cancelled", "Cancelled"), ("Rescheduled", "Rescheduled"),
                    ("Reschedule Requested", "Reschedule Requested"),
                    ("Pending", "Pending"),
                ],
                default="Confirmed", max_length=50,
            ),
        ),

        # --- DiagnosticReport (new, replaces the free-text Diagnosis) --
        migrations.CreateModel(
            name="DiagnosticReport",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("report_type", models.CharField(
                    choices=[
                        ("XRAY", "X-Ray"), ("MRI", "MRI"), ("CT", "CT Scan"),
                        ("ULTRASOUND", "Ultrasound"), ("BLOOD", "Blood Work"),
                        ("OTHER", "Other"),
                    ],
                    default="OTHER", max_length=20,
                )),
                ("file", models.FileField(upload_to="diagnostic_reports/")),
                ("original_filename", models.CharField(blank=True, default="", max_length=255)),
                ("size", models.PositiveIntegerField(default=0)),
                ("mime", models.CharField(blank=True, default="", max_length=100)),
                ("notes", models.TextField(blank=True, default="")),
                ("uploaded_at", models.DateTimeField(auto_now_add=True)),
                ("pet", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="diagnostic_reports", to="appointments.pet")),
            ],
            options={"ordering": ["-uploaded_at"]},
        ),

        # --- TreatmentPlan reshape: add new structured fields ----------
        migrations.AddField(
            model_name="treatmentplan",
            name="therapies",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="treatmentplan",
            name="frequency_custom",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="treatmentplan",
            name="duration",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
        migrations.AddField(
            model_name="treatmentplan",
            name="duration_custom",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="treatmentplan",
            name="start_date",
            field=models.DateField(default=datetime.date(2026, 1, 1)),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="treatmentplan",
            name="end_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="treatmentplan",
            name="status",
            field=models.CharField(
                choices=[("ACTIVE", "Active"), ("COMPLETED", "Completed"), ("PAUSED", "Paused")],
                default="ACTIVE", max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="treatmentplan",
            name="completed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="treatmentplan",
            name="updated_at",
            field=models.DateTimeField(auto_now=True),
        ),
        migrations.AlterField(
            model_name="treatmentplan",
            name="frequency",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
        migrations.AlterModelOptions(
            name="treatmentplan",
            options={"ordering": ["-created_at"]},
        ),

        migrations.CreateModel(
            name="ProgressNote",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("session_no", models.PositiveIntegerField(default=1)),
                ("notes", models.TextField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("plan", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="progress_notes", to="appointments.treatmentplan")),
            ],
            options={"ordering": ["session_no", "created_at"]},
        ),

        # --- Invoice reshape: add new fields (nullable for backfill) ---
        migrations.AddField(
            model_name="invoice",
            name="invoice_no",
            field=models.CharField(max_length=50, null=True, blank=True),
        ),
        migrations.AddField(
            model_name="invoice",
            name="pet",
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="invoices", to="appointments.pet",
            ),
        ),
        migrations.AddField(
            model_name="invoice",
            name="owner",
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="invoices", to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="invoice",
            name="tax",
            field=models.DecimalField(decimal_places=2, default="0.00", max_digits=10),
        ),
        migrations.AddField(
            model_name="invoice",
            name="payment_mode",
            field=models.CharField(
                choices=[
                    ("post_treatment", "Post Treatment"),
                    ("pre_payment", "Pre Payment"),
                    ("package", "Package"),
                ],
                default="post_treatment", max_length=20,
            ),
        ),
        migrations.AlterModelOptions(
            name="invoice",
            options={"ordering": ["-created_at"]},
        ),

        # --- LineItem (renamed from InvoiceItem), preserving data -------
        migrations.RenameModel(old_name="InvoiceItem", new_name="LineItem"),
        migrations.AlterField(
            model_name="lineitem",
            name="invoice",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="line_items", to="appointments.invoice"),
        ),

        # --- Payment / Package (new) ------------------------------------
        migrations.CreateModel(
            name="Payment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("amount_paid", models.DecimalField(decimal_places=2, max_digits=10)),
                ("gateway_ref", models.CharField(blank=True, default="", max_length=255, null=True)),
                ("status", models.CharField(
                    choices=[("SUCCESS", "Success"), ("PENDING", "Pending"), ("FAILED", "Failed")],
                    default="SUCCESS", max_length=20,
                )),
                ("paid_at", models.DateTimeField(auto_now_add=True)),
                ("idempotency_key", models.CharField(max_length=255, null=True, blank=True, unique=True)),
                ("invoice", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="payments", to="appointments.invoice")),
            ],
            options={"ordering": ["-paid_at"]},
        ),
        migrations.CreateModel(
            name="Package",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("total_sessions", models.PositiveIntegerField(default=0)),
                ("used_sessions", models.PositiveIntegerField(default=0)),
                ("invoice", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="package", to="appointments.invoice")),
            ],
        ),

        # --- Notification (new) -----------------------------------------
        migrations.CreateModel(
            name="Notification",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("type", models.CharField(max_length=50)),
                ("message", models.TextField()),
                ("is_read", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("link", models.CharField(blank=True, default="", max_length=255, null=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="notifications", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-created_at"]},
        ),

        # --- QueryMessage: add sender FK, QueryAttachment (new) ---------
        migrations.AddField(
            model_name="querymessage",
            name="sender",
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="query_messages", to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterModelOptions(
            name="querymessage",
            options={"ordering": ["sent_at"]},
        ),
        migrations.CreateModel(
            name="QueryAttachment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("file", models.FileField(upload_to="query_attachments/")),
                ("original_filename", models.CharField(blank=True, default="", max_length=255)),
                ("mime", models.CharField(blank=True, default="", max_length=100)),
                ("size", models.PositiveIntegerField(default=0)),
                ("message", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="attachments", to="appointments.querymessage")),
            ],
        ),

        # --- QueryThread.pet -> one-to-one (unique) ----------------------
        migrations.AlterField(
            model_name="querythread",
            name="pet",
            field=models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="query_thread", to="appointments.pet"),
        ),
    ]
