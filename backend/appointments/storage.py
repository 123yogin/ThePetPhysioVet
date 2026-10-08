"""Upload storage in Postgres, and the signed links that serve it.

Why this exists: production is Django on Vercel serverless, whose filesystem
is read-only. With FileSystemStorage as the default, every upload (diagnostic
reports, query attachments, pet photos) died in `os.open` and the API answered
with an HTML 500. The owner chose to keep uploads in the Neon database rather
than add an object store, so `DatabaseStorage` writes the bytes to the
`StoredFile` table. settings.py selects it when FILE_STORAGE=db or when
running on Vercel; local dev keeps FileSystemStorage unless told otherwise.

Downloads go through `GET /api/v1/files/<token>` (views/files.py). The token is
a 15-minute TimestampSigner signature (salt "file-access") over
`[storage name, StoredFile id]`. Serializers only emit it to callers already
authorised to see the parent record, so the token itself is the capability --
which is what lets a plain `<a href>` / `<img src>` work without a bearer
header.

Binding to the row id as well as the name means a token outlives neither its
row nor a later row that happens to reuse the name. Uploads get random UUID
names (models/files.py), and the row id of such a file *is* that UUID, so
issuing a token costs no query; any other name (legacy or written outside an
upload) is looked up. FileSystemStorage has no rows, so its tokens carry the
name only -- UUID names already make those unguessable and never reused.
"""
import contextvars
import mimetypes
import os
import re
import uuid
from contextlib import contextmanager

from django.core import signing
from django.core.files.base import ContentFile
from django.core.files.storage import Storage, default_storage
from django.db import IntegrityError, transaction
from django.utils.deconstruct import deconstructible

FILE_TOKEN_SALT = "file-access"
FILE_TOKEN_MAX_AGE = 15 * 60  # seconds

# Concurrent saves under one name both pass get_available_name()'s exists()
# check; the unique constraint then rejects the loser, which retries under a
# fresh random suffix. A handful of attempts is plenty.
_SAVE_ATTEMPTS = 5

_UUID_BASENAME = re.compile(r"([0-9a-f]{32})(\.[a-z0-9]{1,8})?")

# Who is uploading, for StoredFile.uploaded_by (the per-owner quota). Set by
# views/_shared.py `upload_storage_guard`; storages have no request.
_current_uploader = contextvars.ContextVar("file_uploader", default=None)


@contextmanager
def attribute_uploads_to(user):
    token = _current_uploader.set(user if getattr(user, "pk", None) else None)
    try:
        yield
    finally:
        _current_uploader.reset(token)


def delete_on_commit(storage, name):
    """Delete `name` from `storage` once the surrounding transaction commits.

    A delete that rolls back must keep its file: for FileSystemStorage the
    unlink is not transactional, and for DatabaseStorage deferring keeps the
    same rule in one place. Runs immediately when no transaction is open.
    """
    if not name:
        return

    def _delete():
        try:
            storage.delete(name)
        except Exception:  # noqa: BLE001 -- a failed cleanup must not fail the request
            import logging
            logging.getLogger(__name__).exception("could not delete stored file after commit")

    transaction.on_commit(_delete)


def _signer():
    return signing.TimestampSigner(salt=FILE_TOKEN_SALT)


def _uuid_from_name(name):
    match = _UUID_BASENAME.fullmatch(os.path.basename(name or ""))
    return uuid.UUID(match.group(1)) if match else None


def file_token(name, storage=None, filename=None):
    """Signed, timestamped token naming one stored file (and its row).

    `filename` is the uploader's original name; it rides in the signed payload
    only so the download can offer it as the save-as name."""
    storage = storage or default_storage
    row_id = storage.row_id(name) if hasattr(storage, "row_id") else None
    payload = [name, row_id.hex if row_id else None]
    if filename:
        payload.append(str(filename)[:255])
    return _signer().sign_object(payload)


def parse_file_token(token):
    """`(name, row_id_hex_or_None, original_filename_or_None)` from `token`, or
    None if forged/expired."""
    try:
        payload = _signer().unsign_object(token, max_age=FILE_TOKEN_MAX_AGE)
    except (signing.BadSignature, ValueError):
        return None
    if not (isinstance(payload, list) and len(payload) in (2, 3)):
        return None
    name, row_id = payload[0], payload[1]
    original = payload[2] if len(payload) == 3 else None
    if original is not None and not isinstance(original, str):
        return None
    if not (isinstance(name, str) and name):
        return None
    if row_id is not None and not isinstance(row_id, str):
        return None
    return name, row_id, original


# Spelled out rather than reverse()d: the app's routes are mounted at both
# /api/v1/ and /api/, and reverse() resolves to whichever was included last.
FILE_DOWNLOAD_PREFIX = "/api/v1/files/"


def signed_file_path(name, storage=None, filename=None):
    return f"{FILE_DOWNLOAD_PREFIX}{file_token(name, storage, filename)}"


def signed_file_url(field_file, request=None, filename=None):
    """Absolute signed download URL for a FieldFile, or None if empty.

    Works for any storage backend: the download view opens the file through
    `default_storage`, so local FileSystemStorage is served the same way.
    """
    if not field_file:
        return None
    path = signed_file_path(field_file.name, field_file.storage, filename)
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
        uploader = _current_uploader.get()
        for attempt in range(_SAVE_ATTEMPTS):
            try:
                with transaction.atomic():
                    StoredFile.objects.create(
                        # A UUID-named upload's row id is that UUID, so its
                        # token can be issued without a lookup (row_id()).
                        id=_uuid_from_name(name) or uuid.uuid4(),
                        name=name, content=data, size=len(data),
                        content_type=content_type[:100],
                        uploaded_by=uploader,
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

    def row_id(self, name):
        """The StoredFile id for `name` (None if there is no such row)."""
        derived = _uuid_from_name(name)
        if derived is not None:
            return derived
        return self._model().objects.filter(name=name).values_list("id", flat=True).first()

    def _row(self, **lookup):
        row = (
            self._model().objects.filter(**lookup)
            .values_list("content", "content_type").first()
        )
        if row is None:
            raise FileNotFoundError(lookup.get("name"))
        content, content_type = row
        f = ContentFile(bytes(content), name=lookup["name"])
        f.content_type = content_type or _guess_type(lookup["name"])
        return f

    def _open(self, name, mode="rb"):
        if "w" in mode or "a" in mode or "+" in mode:
            raise ValueError("DatabaseStorage files are read-only once saved.")
        return self._row(name=name)

    def open_bound(self, name, row_id):
        """Open `name` only if it is still the row the token was issued for."""
        try:
            pk = uuid.UUID(row_id)
        except (TypeError, ValueError):
            raise FileNotFoundError(name)
        return self._row(name=name, id=pk)

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
        return signed_file_path(name, self)
