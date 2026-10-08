"""Upload storage in Postgres, and the signed links that serve it.

Why this exists: production is Django on Vercel serverless, whose filesystem
is read-only. With FileSystemStorage as the default, every upload (diagnostic
reports, query attachments, pet photos) died in `os.open` and the API answered
with an HTML 500. The owner chose to keep uploads in the Neon database rather
than add an object store, so `DatabaseStorage` writes the bytes to the
`StoredFile` table. settings.py selects it when FILE_STORAGE=db or when
running on Vercel; local dev keeps FileSystemStorage unless told otherwise.

Downloads go through `GET /api/v1/files/<token>` (views/files.py). The token is
a 15-minute TimestampSigner signature over the storage name. Serializers only
emit it to callers already authorised to see the parent record, so the token
itself is the capability -- which is what lets a plain `<a href>` / `<img src>`
work without a bearer header.
"""
import mimetypes
import os

from django.core import signing
from django.core.files.base import ContentFile
from django.core.files.storage import Storage
from django.db import IntegrityError, transaction
from django.utils.deconstruct import deconstructible

FILE_TOKEN_SALT = "file-access"
FILE_TOKEN_MAX_AGE = 15 * 60  # seconds

# Concurrent uploads of the same filename both pass get_available_name()'s
# exists() check; the unique constraint then rejects the loser, which retries
# under a fresh random suffix. A handful of attempts is plenty.
_SAVE_ATTEMPTS = 5


def _signer():
    return signing.TimestampSigner(salt=FILE_TOKEN_SALT)


def file_token(name):
    """Signed, timestamped token naming one stored file."""
    return _signer().sign_object(name)


def name_from_token(token):
    """The storage name inside `token`, or None if it is forged or expired."""
    try:
        name = _signer().unsign_object(token, max_age=FILE_TOKEN_MAX_AGE)
    except (signing.BadSignature, ValueError):
        return None
    return name if isinstance(name, str) and name else None


# Spelled out rather than reverse()d: the app's routes are mounted at both
# /api/v1/ and /api/, and reverse() resolves to whichever was included last.
FILE_DOWNLOAD_PREFIX = "/api/v1/files/"


def signed_file_path(name):
    return f"{FILE_DOWNLOAD_PREFIX}{file_token(name)}"


def signed_file_url(field_file, request=None):
    """Absolute signed download URL for a FieldFile, or None if empty.

    Works for any storage backend: the download view opens the file through
    `default_storage`, so local FileSystemStorage is served the same way.
    """
    if not field_file:
        return None
    path = signed_file_path(field_file.name)
    return request.build_absolute_uri(path) if request else path


def _guess_type(name):
    return mimetypes.guess_type(name)[0] or "application/octet-stream"


@deconstructible
class DatabaseStorage(Storage):
    """Django storage backend keeping file bytes in `StoredFile` rows."""

    @staticmethod
    def _model():
        # Imported lazily: storages are instantiated while settings load,
        # before the app registry is ready.
        from .models import StoredFile
        return StoredFile

    def _save(self, name, content):
        StoredFile = self._model()
        if hasattr(content, "seek"):
            content.seek(0)
        data = b"".join(content.chunks()) if hasattr(content, "chunks") else content.read()
        content_type = getattr(content, "content_type", None) or _guess_type(name)
        for attempt in range(_SAVE_ATTEMPTS):
            try:
                with transaction.atomic():
                    StoredFile.objects.create(
                        name=name, content=data, size=len(data),
                        content_type=content_type[:100],
                    )
                return name
            except IntegrityError:
                if attempt == _SAVE_ATTEMPTS - 1:
                    raise
                name = self.get_alternative_name(*self._split(name))
        return name  # pragma: no cover

    @staticmethod
    def _split(name):
        dir_name, file_name = os.path.split(name)
        root, ext = os.path.splitext(file_name)
        return os.path.join(dir_name, root), ext

    def _open(self, name, mode="rb"):
        if "w" in mode or "a" in mode or "+" in mode:
            raise ValueError("DatabaseStorage files are read-only once saved.")
        row = (
            self._model().objects.filter(name=name)
            .values_list("content", "content_type").first()
        )
        if row is None:
            raise FileNotFoundError(name)
        content, content_type = row
        f = ContentFile(bytes(content), name=name)
        f.content_type = content_type or _guess_type(name)
        return f

    def exists(self, name):
        return self._model().objects.filter(name=name).exists()

    def delete(self, name):
        if name:
            self._model().objects.filter(name=name).delete()

    def size(self, name):
        size = self._model().objects.filter(name=name).values_list("size", flat=True).first()
        if size is None:
            raise FileNotFoundError(name)
        return size

    def url(self, name):
        return signed_file_path(name)
