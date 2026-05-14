from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0006_doctor_profile_and_appointment_v2"),
    ]

    operations = [
        migrations.AddField(
            model_name="appointment",
            name="visit_type",
            field=models.CharField(
                choices=[("Clinic", "Clinic"), ("Home", "Home visit")],
                default="Clinic",
                max_length=10,
            ),
        ),
    ]
