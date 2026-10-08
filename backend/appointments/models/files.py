"""Uploaded file bytes, stored in Postgres.

Production runs on Vercel serverless, where the filesystem is read-only, and
the owner chose to keep uploads in the Neon database rather than add an object
store. `appointments.storage.DatabaseStorage` reads and writes this table; the
FileFields on DiagnosticReport, QueryAttachment and Pet hold the `name` key.

Every byte here counts against Neon's storage quota (1 GB on the free plan),
so the upload routes cap files at 10 MB and deleting a record deletes its row
(see appointments/signals.py).
"""
import uuid

from django.db import models


class StoredFile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # The storage key, e.g. "diagnostic_reports/scan_a1b2c3.png". Uniqueness is
    # enforced here, not by a prior exists() check, so two concurrent uploads
    # of the same filename cannot overwrite each other.
    name = models.CharField(max_length=255, unique=True)
    content = models.BinaryField()
    size = models.PositiveIntegerField(default=0)
    content_type = models.CharField(max_length=100, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name
