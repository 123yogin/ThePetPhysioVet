"""Leads from the public marketing form, before they become an owner.

Split out of a single 583-line models.py. Cross-model foreign keys are lazy
"appointments.X" strings, so these modules import nothing from each other and
cannot form a cycle. No schema changed: Django keys models by app_label and
class name, not module path.
"""
import uuid

from django.db import models


class Enquiry(models.Model):
    """Public marketing-site booking-form submission (2026-09-02).

    The marketing site (a separate static site, not this repo) fabricated a
    reference number client-side and sent the form nowhere. This model backs
    an enquiry inbox instead: `POST /api/v1/enquiries` is the only
    unauthenticated *write* in this app, and it never touches `Pet` or
    `Appointment` directly — a doctor triages every submission via `POST
    /enquiries/:id/convert` (see `views.enquiry_convert_view`) before it
    becomes a real patient record. This keeps the public internet from being
    able to write directly into clinical data.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    STATUS_CHOICES = (
        ("NEW", "New"),
        ("CONVERTED", "Converted"),
        ("DISMISSED", "Dismissed"),
    )

    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100, blank=True)
    pet_name = models.CharField(max_length=100)
    species_breed = models.CharField(max_length=200, blank=True)
    email = models.EmailField()
    phone = models.CharField(max_length=50)
    reason = models.TextField(max_length=2000, blank=True)
    preferred_date = models.DateField(null=True, blank=True)
    preferred_specialist = models.CharField(max_length=150, blank=True, default="")

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="NEW")
    created_at = models.DateTimeField(auto_now_add=True)

    # Set on conversion only — see enquiry_convert_view. SET_NULL rather than
    # CASCADE: deleting the resulting appointment must not silently delete
    # the audit trail of the enquiry that produced it.
    converted_appointment = models.ForeignKey(
        "appointments.Appointment", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="source_enquiry",
    )
    # Who actioned this enquiry (converted or dismissed it) and when — an
    # audit trail for a route that creates owner accounts and clinical
    # appointments on a doctor's say-so.
    actioned_by = models.ForeignKey(
        "appointments.UserProfile", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="actioned_enquiries",
    )
    actioned_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Enquiry({self.pet_name} / {self.email}) [{self.status}]"
