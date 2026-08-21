from decimal import Decimal

from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator


class UserProfile(AbstractUser):
    ROLE_CHOICES = (
        ("DOCTOR", "Doctor"),
        ("OWNER", "Pet Owner"),
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="DOCTOR")
    # Known-issue #8: email uniqueness was not enforced at all, so two
    # accounts could share an email and break password-reset / account
    # recovery. `create_user()` (and Django's UserManager defaults) leave
    # `email=""` when none is supplied, so a plain `unique=True` would break
    # the moment a second user was created without an email. A partial
    # unique constraint (below) allows any number of blank emails while
    # still enforcing uniqueness on real ones.
    email = models.EmailField("email address", blank=True)
    clinic_name = models.CharField(max_length=255, blank=True, default="")
    clinic_address = models.TextField(blank=True, default="")
    clinic_phone = models.CharField(max_length=50, blank=True, default="")
    phone = models.CharField(max_length=50, blank=True, default="")

    class Meta(AbstractUser.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["email"],
                condition=~models.Q(email=""),
                name="unique_nonblank_userprofile_email",
            ),
        ]

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.role})"


class Pet(models.Model):
    # Ownership FKs (nullable — backfilled by data migration, unmatched rows stay
    # doctor-visible only per API_CONTRACT.md).
    owner = models.ForeignKey(
        UserProfile, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="pets",
    )
    doctor = models.ForeignKey(
        UserProfile, on_delete=models.SET_NULL, null=True, blank=True,
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


class Appointment(models.Model):
    # B1/B2 fix (2026-08-21): the three original codes below did not cover
    # the services the clinic actually offers (hydrotherapy, laser therapy),
    # so all three frontend booking forms — each hardcoding its own
    # vocabulary — sent strings that never matched and every booking 400'd.
    # Existing codes are left unchanged so current rows stay valid; two new
    # codes were added for the two missing service types. The canonical list
    # is also exposed at GET /appointment-options so the frontend never has
    # to hardcode (or drift from) this vocabulary again.
    VISIT_TYPES = (
        ("Initial", "Initial Consultation"),
        ("Followup", "Follow-up Session"),
        ("Reassessment", "Re-assessment"),
        ("Hydrotherapy", "Hydrotherapy"),
        ("LaserTherapy", "Laser Therapy"),
    )
    STATUS_CHOICES = (
        ("Confirmed", "Confirmed"),
        ("Completed", "Completed"),
        ("Cancelled", "Cancelled"),
        ("Rescheduled", "Rescheduled"),
        ("Reschedule Requested", "Reschedule Requested"),
        ("Pending", "Pending"),
    )

    pet = models.ForeignKey(Pet, on_delete=models.CASCADE, related_name="appointments")
    doctor = models.ForeignKey(
        UserProfile, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="appointments",
    )
    pet_name = models.CharField(max_length=100)
    owner_name = models.CharField(max_length=150)
    owner_phone = models.CharField(max_length=50)
    date = models.DateField()
    time = models.TimeField()
    visit_type = models.CharField(max_length=50, choices=VISIT_TYPES, default="Initial")
    visit_type_display = models.CharField(max_length=100, blank=True, default="Initial Consultation")
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default="Confirmed")
    requested_date = models.DateField(null=True, blank=True)
    requested_time = models.TimeField(null=True, blank=True)
    reschedule_reason = models.TextField(blank=True, default="")
    reason_notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.pet_name} on {self.date} at {self.time} [{self.status}]"


class DiagnosticReport(models.Model):
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

    pet = models.ForeignKey(Pet, on_delete=models.CASCADE, related_name="diagnostic_reports")
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
    STATUS_CHOICES = (
        ("ACTIVE", "Active"),
        ("COMPLETED", "Completed"),
        ("PAUSED", "Paused"),
    )

    pet = models.ForeignKey(Pet, on_delete=models.CASCADE, related_name="treatment_plans")
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
    plan = models.ForeignKey(TreatmentPlan, on_delete=models.CASCADE, related_name="progress_notes")
    session_no = models.PositiveIntegerField(default=1)
    notes = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["session_no", "created_at"]

    def __str__(self):
        return f"Session {self.session_no} note for plan #{self.plan_id}"


class Invoice(models.Model):
    PAYMENT_STATUS_CHOICES = (
        ("PAID", "Paid"),
        ("PENDING", "Pending"),
        ("PARTIALLY_PAID", "Partially Paid"),
    )
    PAYMENT_MODE_CHOICES = (
        ("post_treatment", "Post Treatment"),
        ("pre_payment", "Pre Payment"),
        ("package", "Package"),
    )

    invoice_no = models.CharField(max_length=50, unique=True)
    # Nullable: a handful of legacy invoices may not cleanly match a Pet
    # during backfill (API_CONTRACT.md ownership-backfill note) — such rows
    # stay doctor-visible only, never owner-visible.
    pet = models.ForeignKey(
        Pet, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="invoices",
    )
    owner = models.ForeignKey(
        UserProfile, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="invoices",
    )
    tax = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    payment_mode = models.CharField(max_length=20, choices=PAYMENT_MODE_CHOICES, default="post_treatment")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Invoice {self.invoice_no}"

    # --- server-computed fields (never trust client input for these) ---

    @property
    def subtotal(self):
        total = sum((item.amount for item in self.line_items.all()), Decimal("0.00"))
        return total

    @property
    def total(self):
        return self.subtotal + (self.tax or Decimal("0.00"))

    @property
    def amount_paid(self):
        total = sum(
            (p.amount_paid for p in self.payments.filter(status="SUCCESS")),
            Decimal("0.00"),
        )
        return total

    @property
    def balance_due(self):
        return self.total - self.amount_paid

    @property
    def payment_status(self):
        total = self.total
        paid = self.amount_paid
        if total > 0 and paid >= total:
            return "PAID"
        if paid > 0:
            return "PARTIALLY_PAID"
        return "PENDING"


class LineItem(models.Model):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="line_items")
    description = models.CharField(max_length=255)
    # Known-issue #4 (API_CONTRACT.md §3 Billing, "money guards"): a negative
    # unit_price/quantity previously minted a negative invoice and dragged
    # /revenue.total_revenue below zero.
    quantity = models.IntegerField(default=1, validators=[MinValueValidator(0)])
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    amount = models.DecimalField(max_digits=10, decimal_places=2)

    def save(self, *args, **kwargs):
        if self.amount is None:
            self.amount = (self.unit_price or Decimal("0.00")) * (self.quantity or 0)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.description} ({self.quantity} x {self.unit_price})"


class Payment(models.Model):
    STATUS_CHOICES = (
        ("SUCCESS", "Success"),
        ("PENDING", "Pending"),
        ("FAILED", "Failed"),
    )

    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="payments")
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2)
    gateway_ref = models.CharField(max_length=255, null=True, blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="SUCCESS")
    paid_at = models.DateTimeField(auto_now_add=True)
    # CLAUDE.md rule 6: idempotent money-touching mutations.
    idempotency_key = models.CharField(max_length=255, unique=True, null=True, blank=True)

    class Meta:
        ordering = ["-paid_at"]

    def __str__(self):
        return f"Payment {self.amount_paid} for invoice {self.invoice_id}"


class Package(models.Model):
    invoice = models.OneToOneField(Invoice, on_delete=models.CASCADE, related_name="package")
    total_sessions = models.PositiveIntegerField(default=0)
    used_sessions = models.PositiveIntegerField(default=0)

    @property
    def remaining_sessions(self):
        return max(self.total_sessions - self.used_sessions, 0)

    def __str__(self):
        return f"Package for invoice {self.invoice_id} ({self.used_sessions}/{self.total_sessions})"


class Notification(models.Model):
    user = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name="notifications")
    type = models.CharField(max_length=50)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    link = models.CharField(max_length=255, blank=True, null=True, default="")

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Notification({self.type}) for {self.user_id}"


class NotificationPref(models.Model):
    owner_phone = models.CharField(max_length=50, unique=True)
    sms_opt_out = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.owner_phone} (Opt-out: {self.sms_opt_out})"


class QueryThread(models.Model):
    pet = models.OneToOneField(Pet, on_delete=models.CASCADE, related_name="query_thread")

    def __str__(self):
        return f"Query Thread for {self.pet.name}"


class QueryMessage(models.Model):
    thread = models.ForeignKey(QueryThread, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(
        UserProfile, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="query_messages",
    )
    sender_role = models.CharField(max_length=20, choices=(("DOCTOR", "Doctor"), ("OWNER", "Pet Owner")))
    sender_name = models.CharField(max_length=150)
    message = models.TextField()
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sent_at"]

    def __str__(self):
        return f"Message by {self.sender_name} at {self.sent_at}"


class QueryAttachment(models.Model):
    message = models.ForeignKey(QueryMessage, on_delete=models.CASCADE, related_name="attachments")
    file = models.FileField(upload_to="query_attachments/")
    original_filename = models.CharField(max_length=255, blank=True, default="")
    mime = models.CharField(max_length=100, blank=True, default="")
    size = models.PositiveIntegerField(default=0)

    def __str__(self):
        return self.original_filename or f"Attachment #{self.pk}"
