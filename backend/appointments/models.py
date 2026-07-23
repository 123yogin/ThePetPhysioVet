from decimal import Decimal

from django.conf import settings
from django.db import models, transaction


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


class OwnerProfile(models.Model):
    """Marks a User as a pet Owner (SRS Owner role). Auto-provisioned when a
    doctor saves a pet carrying an owner email; the owner activates login by
    setting a password via the claim endpoint. A user with an owner_profile
    (and no doctor_profile) is treated as role=OWNER."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owner_profile",
    )
    phone = models.CharField(max_length=30, blank=True)

    def __str__(self):
        return f"Owner {self.user.email or self.user.username}"


class Pet(models.Model):
    """A patient record owned by a doctor. Persists across appointments."""

    doctor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="patients",
    )
    # SRS §3.1 AC-04: the linked Owner account (auto-provisioned from owner_email).
    # SET_NULL so removing an owner account never deletes the clinical record.
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="owned_pets",
    )
    name = models.CharField(max_length=120)
    # SRS §3.3 clinical fields. Added additively (all optional) so existing
    # records + the legacy `pet_type` free-text label keep working.
    SPECIES_CHOICES = [("Dog", "Dog"), ("Cat", "Cat"), ("Bird", "Bird"), ("Other", "Other")]
    species = models.CharField(max_length=20, choices=SPECIES_CHOICES, blank=True)
    pet_type = models.CharField(max_length=80, blank=True, help_text="Legacy free-text species")
    breed = models.CharField(max_length=120, blank=True)
    age = models.CharField(max_length=40, blank=True, help_text="e.g. '4 years' / '6 months'")
    SEX_CHOICES = [("Male", "Male"), ("Female", "Female"), ("Unknown", "Unknown")]
    sex = models.CharField(max_length=10, choices=SEX_CHOICES, blank=True)
    weight = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True, help_text="kg")
    photo = models.ImageField(upload_to="pets/", blank=True, null=True)
    owner_name = models.CharField(max_length=120)
    owner_phone = models.CharField(max_length=30)
    owner_email = models.EmailField(blank=True)
    medical_history = models.TextField(blank=True)
    complaint = models.TextField(blank=True, help_text="Presenting complaint (first visit)")
    complaint_started = models.DateField(null=True, blank=True)
    referred_by = models.CharField(max_length=120, blank=True)
    notes = models.TextField(blank=True, help_text="General notes")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.owner_name})"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # SRS §3.3 AC-02: pet photo resized server-side to max 800×800.
        if self.photo:
            try:
                from PIL import Image
                img = Image.open(self.photo.path)
                if img.width > 800 or img.height > 800:
                    img.thumbnail((800, 800))
                    img.save(self.photo.path)
            except Exception:
                pass  # never let image processing break the save


class Appointment(models.Model):
    # SRS §3.6 visit types. Legacy Clinic/Home retained for existing rows.
    VISIT_INITIAL = "Initial"
    VISIT_FOLLOWUP = "Follow-up"
    VISIT_REVIEW = "Review"
    VISIT_EMERGENCY = "Emergency"
    VISIT_CLINIC = "Clinic"
    VISIT_HOME = "Home"
    VISIT_TYPE_CHOICES = [
        (VISIT_INITIAL, "Initial"),
        (VISIT_FOLLOWUP, "Follow-up"),
        (VISIT_REVIEW, "Review"),
        (VISIT_EMERGENCY, "Emergency"),
        (VISIT_CLINIC, "Clinic"),
        (VISIT_HOME, "Home visit"),
    ]

    # SRS §3.6 status lifecycle. Legacy "Rescheduled" retained for existing rows.
    STATUS_PENDING = "Pending"
    STATUS_CONFIRMED = "Confirmed"
    STATUS_COMPLETED = "Completed"
    STATUS_CANCELLED = "Cancelled"
    STATUS_RESCHEDULE_REQUESTED = "Reschedule Requested"
    STATUS_RESCHEDULED = "Rescheduled"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_CONFIRMED, "Confirmed"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_CANCELLED, "Cancelled"),
        (STATUS_RESCHEDULE_REQUESTED, "Reschedule Requested"),
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
        max_length=20,
        choices=VISIT_TYPE_CHOICES,
        default=VISIT_FOLLOWUP,
    )
    date = models.DateField()
    time = models.TimeField()
    reason_notes = models.TextField(blank=True)
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
    )
    # SRS §3.6 owner reschedule-request workflow: owner proposes a new slot +
    # reason; doctor approves (applies it) or rejects (keeps the original).
    requested_date = models.DateField(null=True, blank=True)
    requested_time = models.TimeField(null=True, blank=True)
    reschedule_reason = models.TextField(blank=True)
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


class Diagnosis(models.Model):
    """A clinical diagnostic report (image / PDF / DICOM) attached to a pet.

    SRS §3.4. Ownership is enforced via ``pet.doctor`` and additionally
    denormalised onto ``doctor`` so the API can scope querysets cheaply.
    """

    XRAY = "XRAY"
    MRI = "MRI"
    CT = "CT"
    BLOOD = "BLOOD"
    OTHER = "OTHER"
    REPORT_TYPE_CHOICES = [
        (XRAY, "X-Ray"),
        (MRI, "MRI"),
        (CT, "CT"),
        (BLOOD, "Blood"),
        (OTHER, "Other"),
    ]

    pet = models.ForeignKey(
        Pet,
        on_delete=models.CASCADE,
        related_name="diagnoses",
    )
    doctor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="diagnoses",
    )
    report_type = models.CharField(max_length=10, choices=REPORT_TYPE_CHOICES)
    file = models.FileField(upload_to="diagnoses/%Y/%m/")
    original_filename = models.CharField(max_length=255)
    mime = models.CharField(max_length=120)
    size = models.PositiveIntegerField(help_text="File size in bytes")
    notes = models.TextField(
        blank=True, help_text="Sanitised rich-text (HTML) clinical notes"
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-uploaded_at", "-id"]  # newest first (AC-02)
        verbose_name_plural = "diagnoses"

    def __str__(self):
        return f"{self.get_report_type_display()} — {self.pet.name}"

    @property
    def is_dicom(self):
        """DICOM files open in a browser tab (v1) rather than inline."""
        if (self.mime or "").lower() == "application/dicom":
            return True
        name = (self.original_filename or "").lower()
        return name.endswith(".dcm") or name.endswith(".dicom")


class TreatmentPlan(models.Model):
    """A structured rehabilitation plan for a pet (SRS §3.5)."""

    # Therapy types (a plan holds a subset, >= 1 enforced in the API).
    LASER = "LASER"
    HYDROTHERAPY = "HYDROTHERAPY"
    STRETCHING = "STRETCHING"
    HOME_EXERCISE = "HOME_EXERCISE"
    OTHER = "OTHER"
    THERAPY_CHOICES = [
        (LASER, "Laser"),
        (HYDROTHERAPY, "Hydrotherapy"),
        (STRETCHING, "Stretching"),
        (HOME_EXERCISE, "Home Exercise"),
        (OTHER, "Other"),
    ]
    THERAPY_VALUES = {c[0] for c in THERAPY_CHOICES}

    DAILY = "DAILY"
    ALTERNATE = "ALTERNATE"
    WEEKLY = "WEEKLY"
    FREQ_CUSTOM = "CUSTOM"
    FREQUENCY_CHOICES = [
        (DAILY, "Daily"),
        (ALTERNATE, "Alternate days"),
        (WEEKLY, "Weekly"),
        (FREQ_CUSTOM, "Custom"),
    ]

    DUR_4WK = "4WK"
    DUR_8WK = "8WK"
    DUR_CUSTOM = "CUSTOM"
    DURATION_CHOICES = [
        (DUR_4WK, "4 weeks"),
        (DUR_8WK, "8 weeks"),
        (DUR_CUSTOM, "Custom"),
    ]

    ACTIVE = "ACTIVE"
    ON_HOLD = "ON_HOLD"
    COMPLETED = "COMPLETED"
    STATUS_CHOICES = [
        (ACTIVE, "Active"),
        (ON_HOLD, "On Hold"),
        (COMPLETED, "Completed"),
    ]

    pet = models.ForeignKey(
        Pet,
        on_delete=models.CASCADE,
        related_name="treatment_plans",
    )
    doctor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="treatment_plans",
    )
    therapies = models.JSONField(default=list, help_text="List of therapy codes")
    frequency = models.CharField(max_length=10, choices=FREQUENCY_CHOICES)
    frequency_custom = models.CharField(max_length=120, blank=True)
    duration = models.CharField(max_length=10, choices=DURATION_CHOICES)
    duration_custom = models.CharField(max_length=120, blank=True)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=ACTIVE)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"Plan for {self.pet.name} ({self.get_status_display()})"


class ProgressNote(models.Model):
    """A per-session, timestamped progress note on a treatment plan (SRS §3.5).

    Ownership flows through ``plan.pet.doctor``.
    """

    plan = models.ForeignKey(
        TreatmentPlan,
        on_delete=models.CASCADE,
        related_name="progress_notes",
    )
    session_no = models.PositiveIntegerField()
    notes = models.TextField(help_text="Sanitised rich-text (HTML) session note")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["session_no", "created_at", "id"]  # chronological

    def __str__(self):
        return f"Session {self.session_no} — plan #{self.plan_id}"


# ---------------------------------------------------------------------------
# Payments & billing (SRS §3.8)
# ---------------------------------------------------------------------------
class InvoiceManager(models.Manager):
    """Manager that owns server-authoritative invoice numbering."""

    def allocate_next_no(self, doctor):
        """Return the next gapless per-doctor invoice number.

        The number is server-assigned and NEVER client-settable. Callers MUST
        invoke this inside a ``transaction.atomic()`` block and create the
        Invoice with the returned number in the SAME transaction so the
        ``select_for_update`` row lock is held until the insert commits — this
        serialises concurrent invoice creation for a doctor and keeps the
        sequence gapless. ``Meta.unique_together (doctor, invoice_no)`` is the
        final safety net that turns any residual race into an IntegrityError
        rather than a duplicate number.
        """
        with transaction.atomic():
            last = (
                self.select_for_update()
                .filter(doctor=doctor)
                .order_by("-invoice_no")
                .first()
            )
            return (last.invoice_no + 1) if last is not None else 1


class Invoice(models.Model):
    """An itemised bill for a pet, owned by a doctor (SRS §3.8).

    ``invoice_no`` is a gapless per-doctor sequence assigned by
    :meth:`InvoiceManager.allocate_next_no` — it is server-authoritative and
    must never be supplied by a client.
    """

    PENDING = "PENDING"
    PAID = "PAID"
    PARTIALLY_PAID = "PARTIALLY_PAID"
    FAILED = "FAILED"
    PAYMENT_STATUS_CHOICES = [
        (PENDING, "Pending"),
        (PAID, "Paid"),
        (PARTIALLY_PAID, "Partially Paid"),
        (FAILED, "Failed"),
    ]

    MODE_ADVANCE = "advance"
    MODE_POST_TREATMENT = "post_treatment"
    MODE_PACKAGE = "package"
    MODE_PARTIAL = "partial"
    PAYMENT_MODE_CHOICES = [
        (MODE_ADVANCE, "Advance"),
        (MODE_POST_TREATMENT, "Post-treatment"),
        (MODE_PACKAGE, "Package"),
        (MODE_PARTIAL, "Partial"),
    ]

    pet = models.ForeignKey(
        Pet,
        on_delete=models.CASCADE,
        related_name="invoices",
    )
    doctor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="invoices",
    )
    invoice_no = models.PositiveIntegerField(
        help_text="Server-assigned, gapless per-doctor sequence (not client-settable)."
    )
    line_items = models.JSONField(
        default=list,
        help_text="List of {description, quantity, unit_price, amount}.",
    )
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    tax = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    payment_status = models.CharField(
        max_length=20,
        choices=PAYMENT_STATUS_CHOICES,
        default=PENDING,
    )
    payment_mode = models.CharField(
        max_length=20,
        choices=PAYMENT_MODE_CHOICES,
        default=MODE_POST_TREATMENT,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = InvoiceManager()

    class Meta:
        ordering = ["-created_at", "-id"]
        unique_together = [("doctor", "invoice_no")]

    def __str__(self):
        return f"Invoice #{self.invoice_no} — {self.pet.name}"


class Payment(models.Model):
    """A single payment attempt against an invoice.

    The cumulative sum of SUCCESS ``amount_paid`` drives the invoice's
    ``payment_status`` transitions (see billing_service.apply_payment).
    """

    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    STATUS_CHOICES = [
        (SUCCESS, "Success"),
        (FAILED, "Failed"),
    ]

    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name="payments",
    )
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2)
    gateway_ref = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        unique=True,
        help_text="Gateway payment id; NULL for manual payments.",
    )
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=SUCCESS)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.status} {self.amount_paid} on invoice #{self.invoice_id}"


class Package(models.Model):
    """A prepaid bundle of sessions tied to a package-mode invoice.

    A session is consumed when an appointment for the pet is marked Completed
    (see billing_service.consume_package_session), tracked idempotently via
    :class:`PackageSessionConsumption`.
    """

    invoice = models.OneToOneField(
        Invoice,
        on_delete=models.CASCADE,
        related_name="package",
    )
    total_sessions = models.PositiveIntegerField()
    used_sessions = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f"Package {self.used_sessions}/{self.total_sessions} (invoice #{self.invoice_id})"

    @property
    def remaining(self):
        return max(self.total_sessions - self.used_sessions, 0)

    @property
    def exhausted(self):
        return self.used_sessions >= self.total_sessions


class PackageSessionConsumption(models.Model):
    """Idempotency ledger: at most one session consumed per (package, appointment).

    Completing — or re-saving — the SAME appointment consumes at most one
    session (US-PAY-04 idempotency, CLAUDE.md rule 6).
    """

    package = models.ForeignKey(
        Package,
        on_delete=models.CASCADE,
        related_name="consumptions",
    )
    appointment = models.ForeignKey(
        Appointment,
        on_delete=models.CASCADE,
        related_name="package_consumptions",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("package", "appointment")]

    def __str__(self):
        return f"Package #{self.package_id} consumed by appt #{self.appointment_id}"


class WebhookEvent(models.Model):
    """Idempotency key store for Razorpay webhooks (US-PAY-03).

    A replayed webhook with an ``event_id`` already recorded here is a no-op.
    """

    event_id = models.CharField(max_length=255, unique=True)
    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="webhook_events",
    )
    payment = models.ForeignKey(
        Payment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="webhook_events",
    )
    processed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-processed_at", "-id"]

    def __str__(self):
        return f"WebhookEvent {self.event_id}"


# ---------------------------------------------------------------------------
# Notifications & reminders (SRS §3.7, §7) — Sprint 5
# ---------------------------------------------------------------------------
class Notification(models.Model):
    """An in-app notification delivered to a doctor (SRS §3.7, §7).

    ``dedup_key`` is the shared idempotency key for both the §7 catalogue events
    and scheduled reminders: :func:`appointments.notifications.notify` does
    ``get_or_create(dedup_key=...)`` so re-processing the same event (or firing a
    reminder twice inside the window) never creates a duplicate row. A NULL key
    always creates a fresh notification.
    """

    APPOINTMENT_CREATED = "APPOINTMENT_CREATED"
    APPOINTMENT_ACCEPTED = "APPOINTMENT_ACCEPTED"
    APPOINTMENT_RESCHEDULED = "APPOINTMENT_RESCHEDULED"
    APPOINTMENT_CANCELLED = "APPOINTMENT_CANCELLED"
    INVOICE_GENERATED = "INVOICE_GENERATED"
    PAYMENT_RECEIVED = "PAYMENT_RECEIVED"
    DIAGNOSIS_UPLOADED = "DIAGNOSIS_UPLOADED"
    TREATMENT_ADDED = "TREATMENT_ADDED"
    REMINDER = "REMINDER"
    MESSAGE_RECEIVED = "MESSAGE_RECEIVED"  # SRS §3.9 owner<->doctor query message
    TYPE_CHOICES = [
        (APPOINTMENT_CREATED, "Appointment created"),
        (APPOINTMENT_ACCEPTED, "Appointment accepted"),
        (APPOINTMENT_RESCHEDULED, "Appointment rescheduled"),
        (APPOINTMENT_CANCELLED, "Appointment cancelled"),
        (INVOICE_GENERATED, "Invoice generated"),
        (PAYMENT_RECEIVED, "Payment received"),
        (DIAGNOSIS_UPLOADED, "Diagnosis uploaded"),
        (TREATMENT_ADDED, "Treatment plan added"),
        (REMINDER, "Appointment reminder"),
        (MESSAGE_RECEIVED, "New message"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
        help_text="The doctor who receives this notification.",
    )
    type = models.CharField(max_length=32, choices=TYPE_CHOICES)
    message = models.TextField(help_text="Human-readable text naming the pet/owner/subject.")
    is_read = models.BooleanField(default=False)
    dedup_key = models.CharField(
        max_length=255,
        unique=True,
        null=True,
        blank=True,
        help_text="Idempotency key for catalogue events + reminders; NULL always creates.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            # Backs the dashboard feed + unread-count queries.
            models.Index(
                fields=["user", "is_read", "-created_at"],
                name="notif_user_read_created_idx",
            ),
        ]

    def __str__(self):
        return f"{self.get_type_display()} -> {self.user_id}"


class NotificationPref(models.Model):
    """SMS delivery preference keyed by owner phone number (SRS §3.7 AC-03).

    Pet owners are free-text on ``Pet`` today (not Users), so the SMS opt-out is
    keyed by phone. Opted-in by default (``sms_opt_out=False``). Consulted
    centrally in the delivery dispatcher before any SMS is sent.
    """

    owner_phone = models.CharField(max_length=30, unique=True)
    sms_opt_out = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        state = "opted-out" if self.sms_opt_out else "opted-in"
        return f"{self.owner_phone} ({state})"


class DeviceToken(models.Model):
    """An FCM web-push registration token for a doctor's browser.

    Used by the FCM channel to target the doctor's browser session(s).
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="device_tokens",
    )
    token = models.CharField(max_length=512, unique=True)
    platform = models.CharField(max_length=20, default="web")
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.platform} token for {self.user_id}"


class DeliveryLog(models.Model):
    """One row per delivery attempt — mock or real (SRS §7 audit).

    ``notif_type`` mirrors ``Notification.type`` so the audit trail survives even
    if the notification row is later deleted (``notification`` is SET_NULL).
    """

    SMS = "SMS"
    FCM = "FCM"
    INAPP = "INAPP"
    CHANNEL_CHOICES = [
        (SMS, "SMS"),
        (FCM, "FCM push"),
        (INAPP, "In-app"),
    ]

    QUEUED = "QUEUED"
    SENT = "SENT"
    FAILED = "FAILED"
    MOCK = "MOCK"
    SKIPPED_OPTED_OUT = "SKIPPED_OPTED_OUT"
    STATUS_CHOICES = [
        (QUEUED, "Queued"),
        (SENT, "Sent"),
        (FAILED, "Failed"),
        (MOCK, "Mock"),
        (SKIPPED_OPTED_OUT, "Skipped (opted out)"),
    ]

    notification = models.ForeignKey(
        Notification,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deliveries",
    )
    channel = models.CharField(max_length=10, choices=CHANNEL_CHOICES)
    recipient = models.CharField(
        max_length=512,
        help_text="Owner phone (SMS) or device token / doctor id (FCM).",
    )
    notif_type = models.CharField(
        max_length=32,
        help_text="Mirrors Notification.type for audit even if the row is gone.",
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES)
    detail = models.TextField(blank=True, help_text="Provider ref or error / skip reason.")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.channel} {self.status} -> {self.recipient}"


# ---------------------------------------------------------------------------
# Owner <-> Doctor queries (SRS §3.9) — Sprint 7
# ---------------------------------------------------------------------------
class Query(models.Model):
    """The per-pet query thread anchor (SRS §3.9).

    Exactly one thread per pet (``pet`` is unique). Doctor ownership is derived
    from ``pet.doctor`` — the API scopes every access through that relation.
    Created lazily via ``get_or_create`` on the first message posted to the pet.
    """

    pet = models.OneToOneField(
        Pet,
        on_delete=models.CASCADE,
        related_name="query",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    last_message_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Updated on each appended message; drives inbox ordering.",
    )

    class Meta:
        ordering = ["-last_message_at", "-id"]
        verbose_name_plural = "queries"

    def __str__(self):
        return f"Query thread for {self.pet.name}"


class QueryMessage(models.Model):
    """One append-only message in a query thread (SRS §3.9).

    IMMUTABLE / APPEND-ONLY: there is no update or delete code path and the API
    exposes no PUT/PATCH/DELETE — the thread is an audit trail. ``sender_role``
    is set server-side (never client-supplied). ``sender`` may be NULL, reserved
    for owner-seeded messages until an Owner user model exists.
    """

    DOCTOR = "DOCTOR"
    OWNER = "OWNER"
    SENDER_ROLE_CHOICES = [
        (DOCTOR, "Doctor"),
        (OWNER, "Owner"),
    ]

    query = models.ForeignKey(
        Query,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="query_messages",
        help_text="NULL reserved for owner-seeded messages until an Owner user exists.",
    )
    sender_role = models.CharField(
        max_length=10,
        choices=SENDER_ROLE_CHOICES,
        help_text="Set server-side; never client-supplied.",
    )
    message = models.TextField()
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sent_at", "id"]  # oldest -> newest

    def __str__(self):
        return f"{self.sender_role} msg #{self.id} on query #{self.query_id}"


class QueryAttachment(models.Model):
    """An image file attached to a :class:`QueryMessage` (SRS §3.9).

    Constraints are enforced in the API layer (not at the DB): 0-5 per message,
    JPEG/PNG only, <=5MB each. A message with 6+ or a bad/oversized file is
    rejected atomically — the whole POST returns 400 and no rows are written.
    """

    message = models.ForeignKey(
        QueryMessage,
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    file = models.FileField(upload_to="queries/%Y/%m/")
    original_filename = models.CharField(max_length=255)
    mime = models.CharField(max_length=120)
    size = models.PositiveIntegerField(help_text="File size in bytes")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Attachment {self.original_filename} on message #{self.message_id}"


class AuditLog(models.Model):
    """Server-side audit trail of every state-changing action (SRS §4).

    Written by ``appointments.audit.AuditMiddleware`` for API create/update/
    delete and by ``record_event`` for LOGIN / LOGOUT / LOGIN_FAILED. NEVER
    stores request bodies, passwords, or tokens — only who/what/when metadata.
    """

    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"
    LOGIN_FAILED = "LOGIN_FAILED"
    ACTION_CHOICES = [
        (CREATE, "Create"),
        (UPDATE, "Update"),
        (DELETE, "Delete"),
        (LOGIN, "Login"),
        (LOGOUT, "Logout"),
        (LOGIN_FAILED, "Login failed"),
    ]

    # null for failed logins (no authenticated user) and for actors deleted
    # after the fact — the row survives (SET_NULL) as an immutable record.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    entity_type = models.CharField(max_length=64, blank=True)
    entity_id = models.CharField(max_length=64, null=True, blank=True)
    method = models.CharField(max_length=10, blank=True)
    path = models.CharField(max_length=512, blank=True)
    status_code = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        who = self.user_id if self.user_id is not None else "anon"
        return f"{self.action} {self.entity_type}#{self.entity_id} by {who}"
