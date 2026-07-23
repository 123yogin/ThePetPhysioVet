# Replaces legacy Appointment with doctor-scoped model (existing appointment rows are dropped).

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def _seed_doctor_profiles(apps, schema_editor):
    User = apps.get_model("auth", "User")
    DoctorProfile = apps.get_model("appointments", "DoctorProfile")
    for u in User.objects.all():
        DoctorProfile.objects.get_or_create(
            user_id=u.pk,
            defaults={"clinic_name": "", "clinic_address": "", "clinic_phone": ""},
        )


def _drop_legacy_appointment_table(apps, schema_editor):
    schema_editor.execute("DROP TABLE IF EXISTS appointments_appointment;")


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("appointments", "0005_remove_appointment_fee_amount"),
    ]

    operations = [
        migrations.CreateModel(
            name="DoctorProfile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("clinic_name", models.CharField(blank=True, max_length=200)),
                ("clinic_address", models.TextField(blank=True)),
                ("clinic_phone", models.CharField(blank=True, max_length=30)),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="doctor_profile",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
        migrations.RunPython(_seed_doctor_profiles, migrations.RunPython.noop),
        migrations.RunPython(_drop_legacy_appointment_table, migrations.RunPython.noop),
        migrations.CreateModel(
            name="Appointment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("pet_name", models.CharField(max_length=120)),
                ("pet_type", models.CharField(max_length=80)),
                ("owner_name", models.CharField(max_length=120)),
                ("owner_phone", models.CharField(max_length=30)),
                ("date", models.DateField()),
                ("time", models.TimeField()),
                ("reason_notes", models.TextField(blank=True)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("Pending", "Pending"),
                            ("Completed", "Completed"),
                            ("Rescheduled", "Rescheduled"),
                        ],
                        default="Pending",
                        max_length=20,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "doctor",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="vet_appointments",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["-date", "-time", "-id"]},
        ),
    ]
