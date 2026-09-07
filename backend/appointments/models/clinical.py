"""The clinical record: uploaded reports, rehab plans, and the per-session
outcome measures charted on the pet page.

Split out of a single 583-line models.py. Cross-model foreign keys are lazy
"appointments.X" strings, so these modules import nothing from each other and
cannot form a cycle. No schema changed: Django keys models by app_label and
class name, not module path.
"""
import uuid
from decimal import Decimal

from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator


class DiagnosticReport(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    """File-upload diagnostic report (X-ray / MRI / lab report etc).

    Matches the frontend `Diagnosis` type in `frontend/src/lib/types.ts` — this is
    NOT the old free-text diagnosis note.
    """

    REPORT_TYPES = (
        ("XRAY", "X-Ray"),
        ("MRI", "MRI"),
        ("CT", "CT Scan"),
        ("ULTRASOUND", "Ultrasound"),
        ("BLOOD", "Blood Work"),
        ("OTHER", "Other"),
    )

    pet = models.ForeignKey("appointments.Pet", on_delete=models.CASCADE, related_name="diagnostic_reports")
    report_type = models.CharField(max_length=20, choices=REPORT_TYPES, default="OTHER")
    file = models.FileField(upload_to="diagnostic_reports/")
    original_filename = models.CharField(max_length=255, blank=True, default="")
    size = models.PositiveIntegerField(default=0)
    mime = models.CharField(max_length=100, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"{self.get_report_type_display()} for {self.pet.name}"

class TreatmentPlan(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    STATUS_CHOICES = (
        ("ACTIVE", "Active"),
        ("COMPLETED", "Completed"),
        ("PAUSED", "Paused"),
    )

    pet = models.ForeignKey("appointments.Pet", on_delete=models.CASCADE, related_name="treatment_plans")
    therapies = models.JSONField(default=list, blank=True)
    frequency = models.CharField(max_length=100, blank=True, default="")
    frequency_custom = models.CharField(max_length=255, blank=True, default="")
    duration = models.CharField(max_length=100, blank=True, default="")
    duration_custom = models.CharField(max_length=255, blank=True, default="")
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="ACTIVE")
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Treatment Plan for {self.pet.name}"

class ProgressNote(models.Model):
    """One session in a course of rehab.

    `notes` alone cannot be plotted, cannot be reported objectively to a
    referring vet, and cannot show an owner their animal is improving — and in
    rehabilitation the progress evidence IS the product. The measures below are
    the ones this discipline actually records; every one is optional, because a
    session that only warrants a sentence should still be one click.
    """

    # Standard veterinary lameness grading. Named rather than free scored so a
    # number in the record means the same thing between two clinicians.
    LAMENESS_SCORES = [
        (0, "0 — Sound"),
        (1, "1 — Mild, intermittent"),
        (2, "2 — Mild, consistent"),
        (3, "3 — Moderate, obvious at walk"),
        (4, "4 — Non-weight-bearing"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    plan = models.ForeignKey("appointments.TreatmentPlan", on_delete=models.CASCADE, related_name="progress_notes")
    session_no = models.PositiveIntegerField(default=1)
    notes = models.TextField()

    pain_score = models.PositiveSmallIntegerField(
        null=True, blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(10)],
        help_text="0 = no pain, 10 = worst possible.",
    )
    lameness_score = models.PositiveSmallIntegerField(
        null=True, blank=True, choices=LAMENESS_SCORES,
        help_text="Covers gait and weight-bearing in one validated grade.",
    )
    # Degrees are meaningless without the joint they were measured at, so the
    # two are stored together and the serializer rejects one without the other.
    rom_joint = models.CharField(max_length=60, blank=True, default="")
    rom_degrees = models.DecimalField(
        max_digits=5, decimal_places=1, null=True, blank=True,
        validators=[MinValueValidator(Decimal("0"))],
        help_text="Range of motion at `rom_joint`, in degrees.",
    )
    girth_cm = models.DecimalField(
        max_digits=5, decimal_places=1, null=True, blank=True,
        validators=[MinValueValidator(Decimal("0"))],
        help_text="Limb circumference — the usual proxy for muscle mass.",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["session_no", "created_at"]

    def __str__(self):
        return f"Session {self.session_no} note for plan #{self.plan_id}"
