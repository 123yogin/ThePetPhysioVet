"""The patient record. `owner` and `doctor` are what make the ownership checks
in permissions.py enforceable at all.

Split out of a single 583-line models.py. Cross-model foreign keys are lazy
"appointments.X" strings, so these modules import nothing from each other and
cannot form a cycle. No schema changed: Django keys models by app_label and
class name, not module path.
"""
import uuid

from django.db import models


class Pet(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Ownership FKs (nullable — backfilled by data migration, unmatched rows stay
    # doctor-visible only per API_CONTRACT.md).
    owner = models.ForeignKey(
        "appointments.UserProfile", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="pets",
    )
    doctor = models.ForeignKey(
        "appointments.UserProfile", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="assigned_pets",
    )

    name = models.CharField(max_length=100)
    species = models.CharField(max_length=50, default="Dog")
    pet_type = models.CharField(max_length=100, blank=True, default="")
    breed = models.CharField(max_length=100, blank=True, default="")
    age = models.CharField(max_length=50, blank=True, default="")
    sex = models.CharField(max_length=20, blank=True, default="Male")
    weight = models.CharField(max_length=20, blank=True, default="")
    photo = models.ImageField(upload_to="pets/", null=True, blank=True)
    owner_name = models.CharField(max_length=150)
    owner_phone = models.CharField(max_length=50)
    owner_email = models.EmailField(blank=True, default="")
    medical_history = models.TextField(blank=True, default="")
    complaint = models.TextField(blank=True, default="")
    complaint_started = models.CharField(max_length=50, blank=True, default="")
    referred_by = models.CharField(max_length=150, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.owner_name})"
