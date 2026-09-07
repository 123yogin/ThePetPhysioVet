"""Owner-to-doctor threads: append-only, with image attachments the doctor sees.

Split out of a single 583-line models.py. Cross-model foreign keys are lazy
"appointments.X" strings, so these modules import nothing from each other and
cannot form a cycle. No schema changed: Django keys models by app_label and
class name, not module path.
"""
import uuid

from django.db import models


class QueryThread(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    pet = models.OneToOneField("appointments.Pet", on_delete=models.CASCADE, related_name="query_thread")

    def __str__(self):
        return f"Query Thread for {self.pet.name}"

class QueryMessage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    thread = models.ForeignKey("appointments.QueryThread", on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(
        "appointments.UserProfile", on_delete=models.SET_NULL, null=True, blank=True,
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
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message = models.ForeignKey("appointments.QueryMessage", on_delete=models.CASCADE, related_name="attachments")
    file = models.FileField(upload_to="query_attachments/")
    original_filename = models.CharField(max_length=255, blank=True, default="")
    mime = models.CharField(max_length=100, blank=True, default="")
    size = models.PositiveIntegerField(default=0)

    def __str__(self):
        return self.original_filename or f"Attachment #{self.pk}"
