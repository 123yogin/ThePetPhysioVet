"""Delete blobs in the Vercel Blob store that no `StoredFile` row points at.

An orphan appears when the Blob PUT succeeds but the surrounding request
transaction later rolls back (the row goes, the blob stays). Only blobs older
than an hour are touched, so an upload whose row is not yet committed is never
mistaken for one.

Dry-run by default (lists what it would delete); `--apply` deletes them in
batches. Listing costs one Blob advanced operation per 1000 blobs (Hobby
includes 2,000 a month); deleting is free.

    FILE_STORAGE=blob BLOB_READ_WRITE_TOKEN=... python manage.py cleanup_orphan_blobs [--apply]
"""
from datetime import datetime, timedelta, timezone

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from appointments.models import StoredFile
from appointments.storage_blob import BlobStorage

MIN_AGE = timedelta(hours=1)
DELETE_BATCH = 100


def _uploaded_at(value):
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


class Command(BaseCommand):
    help = "Delete Vercel Blob objects older than 1 hour with no StoredFile row (dry run unless --apply)."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Delete the orphans.")

    def handle(self, *args, apply=False, **options):
        if not (getattr(settings, "BLOB_READ_WRITE_TOKEN", "") or "").strip():
            raise CommandError("BLOB_READ_WRITE_TOKEN is not set; cannot reach Vercel Blob.")
        storage = BlobStorage()
        cutoff = datetime.now(timezone.utc) - MIN_AGE
        try:
            listed = list(storage.list_blobs())
        except OSError as e:  # BlobStorageError messages carry no secrets
            raise CommandError(str(e)) from None

        candidates = []
        for blob in listed:
            when = _uploaded_at(blob.get("uploadedAt"))
            if blob.get("pathname") and blob.get("url") and when and when < cutoff:
                candidates.append(blob)
        indexed = set(
            StoredFile.objects.filter(name__in=[b["pathname"] for b in candidates])
            .values_list("name", flat=True)
        )
        orphans = [b for b in candidates if b["pathname"] not in indexed]

        for blob in orphans:
            self.stdout.write(f"orphan: {blob['pathname']} ({blob.get('size', '?')} bytes, "
                              f"uploaded {blob.get('uploadedAt')})")
        if not apply:
            self.stdout.write(f"Would delete {len(orphans)} orphan blob(s) of {len(listed)} listed. "
                              "Re-run with --apply to delete them.")
            return

        deleted = 0
        for i in range(0, len(orphans), DELETE_BATCH):
            batch = orphans[i:i + DELETE_BATCH]
            try:
                storage.delete_blobs(b["url"] for b in batch)
            except OSError as e:
                raise CommandError(f"Stopped after deleting {deleted} blob(s): {e}") from None
            deleted += len(batch)
        self.stdout.write(f"Deleted {deleted} orphan blob(s).")
