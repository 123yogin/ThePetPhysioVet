"""Uploaded-file index (and, for older rows, bytes) plus the storage names.

Since 2026-10-08 new uploads go to a private Vercel Blob store
(`appointments.storage_blob.BlobStorage`): the row stays as the metadata index
-- name, size, type, uploader, blob URL -- and `content` is NULL. Rows written
by DatabaseStorage keep their bytes in `content` and are still served from it.


Production runs on Vercel serverless, where the filesystem is read-only, and
the owner chose to keep uploads in the Neon database rather than add an object
store. `appointments.storage.DatabaseStorage` reads and writes this table; the
FileFields on DiagnosticReport, QueryAttachment and Pet hold the `name` key.

Every byte here counts against Neon's storage quota (1 GB on the free plan),
so the upload routes cap files at 4 MB, rate-limit uploads, give each owner a
byte quota (summed over `uploaded_by`), refuse uploads once the table nears a
global ceiling, and delete a record's bytes when the record is deleted (see
appointments/views/_shared.py and appointments/signals.py).
"""
import os
import re
import uuid

from django.db import models

_SAFE_EXT = re.compile(r"\.[a-z0-9]{1,8}")


def _random_name(prefix, filename):
    """`<prefix>/<uuid4 hex><ext>`. The client's filename never reaches the
    storage key (it is kept only in `original_filename` for display), so a
    name is never reused after a delete and cannot be guessed or traversed."""
    ext = os.path.splitext(filename or "")[1].lower()
    if not _SAFE_EXT.fullmatch(ext):
        ext = ""
    return f"{prefix}/{uuid.uuid4().hex}{ext}"


# Module-level functions (not lambdas/closures) so migrations can reference them.
def diagnostic_report_upload_to(instance, filename):
    return _random_name("diagnostic_reports", filename)


def pet_photo_upload_to(instance, filename):
    return _random_name("pets", filename)


def query_attachment_upload_to(instance, filename):
    return _random_name("query_attachments", filename)


class StoredFile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # The storage key, e.g. "diagnostic_reports/9f1c...e2.png". Uniqueness is
    # enforced here, not by a prior exists() check, so two concurrent uploads
    # cannot overwrite each other.
    name = models.CharField(max_length=255, unique=True)
    # The bytes, for rows written by DatabaseStorage. NULL for rows whose bytes
    # live in Vercel Blob (storage_blob.BlobStorage); readers branch on that.
    content = models.BinaryField(null=True, blank=True)
    size = models.PositiveIntegerField(default=0)
    content_type = models.CharField(max_length=100, blank=True, default="")
    # Who uploaded it, for the per-owner byte quota. Nullable: files written
    # outside a request (admin, shell) have no uploader, and deleting an
    # account must not delete clinical records' bytes.
    uploaded_by = models.ForeignKey(
        "appointments.UserProfile", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="stored_files",
    )
    # Where a Blob-backed row's bytes are: the private-store URL returned by
    # the Blob PUT (https://<store>.private.blob.vercel-storage.com/<name>).
    # Empty for database-backed rows. Never handed to clients -- downloads go
    # through the signed /files/<token> route. db_default keeps inserts from
    # code that predates the column valid during a deploy.
    blob_url = models.CharField(max_length=1024, blank=True, default="", db_default="")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name
