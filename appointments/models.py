from django.conf import settings
from django.db import models


class DoctorProfile(models.Model):
    """Per-doctor clinic details (used in shared appointment messages)."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="doctor_profile",
    )
    clinic_name = models.CharField(max_length=200, blank=True)
    clinic_address = models.TextField(blank=True)
    clinic_phone = models.CharField(max_length=30, blank=True)

    def __str__(self):
        return f"Dr. {self.user.get_full_name() or self.user.username}"


class Appointment(models.Model):
    VISIT_CLINIC = "Clinic"
    VISIT_HOME = "Home"
    VISIT_TYPE_CHOICES = [
        (VISIT_CLINIC, "Clinic"),
        (VISIT_HOME, "Home visit"),
    ]

    STATUS_PENDING = "Pending"
    STATUS_COMPLETED = "Completed"
    STATUS_RESCHEDULED = "Rescheduled"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_RESCHEDULED, "Rescheduled"),
    ]

    doctor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="vet_appointments",
    )
    pet_name = models.CharField(max_length=120)
    pet_type = models.CharField(max_length=80)
    owner_name = models.CharField(max_length=120)
    owner_phone = models.CharField(max_length=30)
    visit_type = models.CharField(
        max_length=10,
        choices=VISIT_TYPE_CHOICES,
        default=VISIT_CLINIC,
    )
    date = models.DateField()
    time = models.TimeField()
    reason_notes = models.TextField(blank=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "-time", "-id"]

    def __str__(self):
        return f"{self.pet_name} — {self.date} {self.time}"
