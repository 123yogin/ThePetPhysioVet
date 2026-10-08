"""One row per transactional SMS the clinic tried to send (appointments/sms/).

The row is written BEFORE the provider is called, so its unique
`idempotency_key` -- not a prior SELECT -- is what stops a reminder going out
twice when the cron is retried or two requests race. The row's own id doubles
as the message id sent to the gateway, which answers 409 for an id it has
already accepted, so retrying a FAILED row cannot double-send either.

Cross-model foreign keys are lazy "appointments.X" strings, so this module
imports nothing from its siblings.
"""
import uuid

from django.db import models


class SmsMessage(models.Model):
    KIND_CHOICES = (
        ("appointment_confirmed", "Appointment confirmed"),
        ("appointment_reminder", "Appointment reminder"),
        ("boarding_confirmed", "Boarding confirmed"),
        ("boarding_checkout", "Boarding check-out reminder"),
        ("test", "Test message"),
    )
    STATUS_CHOICES = (
        ("QUEUED", "Queued"),
        ("SENT", "Sent"),
        ("DELIVERED", "Delivered"),
        ("FAILED", "Failed"),
        ("SKIPPED_OPTOUT", "Skipped (owner opted out)"),
        ("SKIPPED_LIMIT", "Skipped (daily limit reached)"),
        ("SKIPPED_DISABLED", "Skipped (SMS disabled)"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # E.164 when the number was usable; the raw input otherwise (status FAILED).
    to = models.CharField(max_length=50)
    body = models.TextField()
    kind = models.CharField(max_length=40, choices=KIND_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="QUEUED")
    # Which backend handled it (console / disabled / android_gateway / ...).
    provider = models.CharField(max_length=40, blank=True, default="")
    provider_id = models.CharField(max_length=64, blank=True, default="", db_index=True)
    error = models.TextField(blank=True, default="")
    idempotency_key = models.CharField(max_length=200, unique=True)

    appointment = models.ForeignKey(
        "appointments.Appointment", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="sms_messages",
    )
    boarding = models.ForeignKey(
        "appointments.BoardingBooking", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="sms_messages",
    )
    # The doctor who pressed "Send test SMS"; null for automatic messages.
    requested_by = models.ForeignKey(
        "appointments.UserProfile", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="+",
    )

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    # When the provider accepted it. The daily cap counts rows by this field,
    # so a later delivery/failure webhook does not give a slot back.
    sent_at = models.DateTimeField(null=True, blank=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"SMS {self.kind} [{self.status}]"
