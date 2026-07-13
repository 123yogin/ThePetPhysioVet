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


class Pet(models.Model):
    """A patient record owned by a doctor. Persists across appointments."""

    doctor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="patients",
    )
    name = models.CharField(max_length=120)
    pet_type = models.CharField(max_length=80, help_text="e.g. Dog, Cat, Bird")
    owner_name = models.CharField(max_length=120)
    owner_phone = models.CharField(max_length=30)
    notes = models.TextField(blank=True, help_text="Medical history / general notes")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.owner_name})"


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
    pet = models.ForeignKey(
        Pet,
        on_delete=models.CASCADE,
        related_name="appointments",
    )
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
        return f"{self.pet.name} — {self.date} {self.time}"

    # Convenience proxies so templates / share logic can read pet & owner
    # details directly off the appointment.
    @property
    def pet_name(self):
        return self.pet.name

    @property
    def pet_type(self):
        return self.pet.pet_type

    @property
    def owner_name(self):
        return self.pet.owner_name

    @property
    def owner_phone(self):
        return self.pet.owner_phone
