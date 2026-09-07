"""Notification rows and the per-owner SMS opt-out. Nothing in the app writes a
Notification yet -- see the open debt list in CLAUDE.md.

Split out of a single 583-line models.py. Cross-model foreign keys are lazy
"appointments.X" strings, so these modules import nothing from each other and
cannot form a cycle. No schema changed: Django keys models by app_label and
class name, not module path.
"""
import uuid

from django.db import models


class Notification(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("appointments.UserProfile", on_delete=models.CASCADE, related_name="notifications")
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
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner_phone = models.CharField(max_length=50, unique=True)
    sms_opt_out = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.owner_phone} (Opt-out: {self.sms_opt_out})"
