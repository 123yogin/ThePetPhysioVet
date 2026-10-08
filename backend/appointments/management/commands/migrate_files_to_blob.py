"""Move uploaded bytes still stored in Postgres (`StoredFile.content`) to the
private Vercel Blob store, keeping each row as the index.

Dry-run by default: reports how many rows and bytes would move. With
`--apply`, each row is uploaded to Blob under its existing storage name (so
FileFields and outstanding download tokens keep working), then its `content`
is cleared and `blob_url` recorded -- one row at a time, a conditional update
per row, so an interrupted run loses nothing and a rerun resumes. Re-uploads
overwrite (x-allow-overwrite: 1): a blob left by an interrupted run holds the
same bytes.

    DEBUG=true .venv/bin/python manage.py migrate_files_to_blob           # dry run
    BLOB_READ_WRITE_TOKEN=... python manage.py migrate_files_to_blob --apply
"""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from appointments.models import StoredFile
from appointments.storage_blob import BlobStorage


class Command(BaseCommand):
    help = "Copy database-stored upload bytes to Vercel Blob (dry run unless --apply)."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true",
                            help="Upload to Blob and clear the database copies.")

    def handle(self, *args, apply=False, **options):
        pending = StoredFile.objects.filter(content__isnull=False)
        ids = list(pending.order_by("created_at").values_list("id", flat=True))
        total = sum(pending.values_list("size", flat=True))
        if not apply:
            self.stdout.write(
                f"Would copy {len(ids)} file(s) ({total} bytes) from the database to "
                "Vercel Blob. Re-run with --apply to do it."
            )
            return
        if not (getattr(settings, "BLOB_READ_WRITE_TOKEN", "") or "").strip():
            raise CommandError("BLOB_READ_WRITE_TOKEN is not set; cannot reach Vercel Blob.")

        storage = BlobStorage()
        moved = 0
        for pk in ids:
            row = StoredFile.objects.filter(pk=pk, content__isnull=False) \
                .values_list("name", "content", "content_type").first()
            if row is None:
                continue  # deleted or already moved since the listing
            name, content, content_type = row
            try:
                url = storage.put_blob(name, bytes(content), content_type or "application/octet-stream",
                                       overwrite=True)
            except OSError as e:  # BlobStorageError messages carry no secrets
                raise CommandError(f"Stopped after {moved} file(s): {name}: {e}") from None
            moved += StoredFile.objects.filter(pk=pk, content__isnull=False) \
                .update(content=None, blob_url=url)
        self.stdout.write(f"Copied {moved} file(s) to Vercel Blob and cleared their database copies.")
