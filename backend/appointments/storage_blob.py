"""Uploads in a private Vercel Blob store, indexed by `StoredFile`.

Selected by settings.py when FILE_STORAGE=blob, or when BLOB_READ_WRITE_TOKEN
is set and FILE_STORAGE is not. The store ("petphysio-files") is PRIVATE: a
blob URL is useless without the token, so files still reach users only
through the signed `GET /api/v1/files/<token>` route (views/files.py), which
reads the blob server-side and streams it back with attachment + nosniff.

`StoredFile` stays the index -- name (unique, so concurrent saves cannot
collide), size (owner quota and global ceiling sum it), content type,
uploader, and `blob_url` -- with `content` NULL. Rows written earlier by
DatabaseStorage keep their bytes in `content` and are served from Postgres;
`manage.py migrate_files_to_blob --apply` moves them over.

HTTP calls, copied from the @vercel/blob 2.8.1 SDK (npm tarball,
dist/chunk-GPSPCQKX.js `requestApi`/`createPutMethod`/`constructBlobUrl` and
dist/index.js `del`/`get`) and vercel.com/docs/vercel-blob/private-storage:

- put:  PUT https://vercel.com/api/blob/?pathname=<name>, body = bytes,
        headers authorization: Bearer <token>, x-api-version: 12,
        x-vercel-blob-access: private, x-add-random-suffix: 0,
        x-allow-overwrite: 0|1, x-content-type. JSON reply carries `url`.
- read: GET https://<storeId>.private.blob.vercel-storage.com/<name> with
        authorization: Bearer <token> (storeId = 4th "_" field of the token).
- del:  POST https://vercel.com/api/blob/delete, JSON {"urls": [<url>, ...]}.
- list: GET https://vercel.com/api/blob?limit=<n>[&cursor=<c>] (index.js
        `list`); JSON {blobs: [{url, pathname, size, uploadedAt, etag}],
        cursor, hasMore}. Used only by `manage.py cleanup_orphan_blobs`.

`exists`/`size` answer from the index rather than the Blob `head` call: the
row is authoritative for our names, and Hobby includes only 10k simple
operations a month.

Every request uses urllib with a 10 s timeout and an opener that refuses
redirects (urllib would otherwise re-send the Authorization header to the new
location). The bearer token is sent only to vercel.com or a
*.blob.vercel-storage.com https URL, and never appears in a log line or an
exception message.
"""
import json
import urllib.error
import urllib.request
import uuid
from urllib.parse import quote, urlencode, urlsplit

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import IntegrityError, transaction
from django.utils.deconstruct import deconstructible

from .storage import DatabaseStorage, _SAVE_ATTEMPTS, _current_uploader, _guess_type, _uuid_from_name

BLOB_API_URL = "https://vercel.com/api/blob"
BLOB_API_VERSION = "12"  # @vercel/blob 2.8.1 BLOB_API_VERSION
BLOB_HOST_SUFFIX = ".blob.vercel-storage.com"
BLOB_TIMEOUT_SECONDS = 10
_ERROR_BODY_LIMIT = 4096


class BlobStorageError(OSError):
    """A Blob call failed. An OSError, so `upload_storage_guard` maps it to a
    503 problem like a full disk. Messages name the operation and HTTP status
    only -- never the token or headers."""


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Refuse every redirect: urllib copies the Authorization header onto the
    redirected request, which could hand the token to another host."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


# Module-level so tests can swap in a fake; nothing else touches the network.
_OPENER = urllib.request.build_opener(_NoRedirect)


def _allowed_url(url):
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    return parts.scheme == "https" and (
        host.endswith(BLOB_HOST_SUFFIX)
        or url.startswith(BLOB_API_URL + "/") or url.startswith(BLOB_API_URL + "?")
    )


@deconstructible
class BlobStorage(DatabaseStorage):
    """Django storage backend: bytes in private Vercel Blob, index in StoredFile."""

    # --- HTTP -----------------------------------------------------------

    @staticmethod
    def _token():
        token = (getattr(settings, "BLOB_READ_WRITE_TOKEN", "") or "").strip()
        if not token:
            raise BlobStorageError("Vercel Blob is not configured (BLOB_READ_WRITE_TOKEN is unset).")
        return token

    def _store_url(self, name):
        parts = self._token().split("_")  # vercel_blob_rw_<storeId>_<secret>
        store_id = parts[3] if len(parts) >= 5 else ""
        if not store_id:
            raise BlobStorageError("Vercel Blob token is malformed.")
        return f"https://{store_id}.private{BLOB_HOST_SUFFIX}/{quote(name, safe='/')}"

    def _request(self, op, method, url, data=None, headers=None):
        """Send one Blob request; the open response on success.

        404 -> FileNotFoundError; any other failure -> BlobStorageError. No
        retries: uploads fail fast into a 503 the client can retry, and a
        failed delete is logged by delete_on_commit with its row kept."""
        if not _allowed_url(url):
            # A tampered blob_url must not receive the bearer token.
            raise FileNotFoundError(f"Vercel Blob {op}: refusing non-Blob URL")
        req = urllib.request.Request(url, data=data, method=method, headers={
            "authorization": f"Bearer {self._token()}",
            "x-api-version": BLOB_API_VERSION,
            **(headers or {}),
        })
        try:
            return _OPENER.open(req, timeout=BLOB_TIMEOUT_SECONDS)
        except urllib.error.HTTPError as e:
            code = "unknown_error"
            try:
                code = json.loads(e.read(_ERROR_BODY_LIMIT) or b"{}").get("error", {}).get("code") or code
            except (ValueError, AttributeError, OSError):
                pass
            finally:
                e.close()
            if e.code == 404:
                raise FileNotFoundError(f"Vercel Blob {op}: not found") from None
            raise BlobStorageError(f"Vercel Blob {op} failed: HTTP {e.code} ({str(code)[:64]})") from None
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            raise BlobStorageError(f"Vercel Blob {op} failed: {type(e).__name__}") from None

    def put_blob(self, name, data, content_type, overwrite=False):
        """Upload `data` at pathname `name` (private, no random suffix); its URL."""
        resp = self._request(
            "put", "PUT", f"{BLOB_API_URL}/?{urlencode({'pathname': name})}", data=data,
            headers={
                "x-vercel-blob-access": "private",
                "x-add-random-suffix": "0",
                "x-allow-overwrite": "1" if overwrite else "0",
                "x-content-type": content_type,
            },
        )
        with resp:
            try:
                url = json.loads(resp.read(_ERROR_BODY_LIMIT)).get("url") or ""
            except ValueError:
                url = ""
        if not _allowed_url(url):
            raise BlobStorageError("Vercel Blob put failed: unexpected response")
        return url

    def list_blobs(self, limit=1000):
        """Yield every blob in the store as the API's dict (url, pathname,
        size, uploadedAt, etag), following `cursor` while `hasMore`. Each page
        is one advanced operation."""
        cursor = None
        while True:
            params = {"limit": str(limit)}
            if cursor:
                params["cursor"] = cursor
            with self._request("list", "GET", f"{BLOB_API_URL}?{urlencode(params)}") as resp:
                try:
                    page = json.loads(resp.read())
                except ValueError:
                    raise BlobStorageError("Vercel Blob list failed: unexpected response") from None
            yield from page.get("blobs") or []
            cursor = page.get("cursor")
            if not (page.get("hasMore") and cursor):
                return

    def delete_blobs(self, urls):
        """Delete blobs by URL in one call (the API takes a list)."""
        self._request(
            "delete", "POST", f"{BLOB_API_URL}/delete",
            data=json.dumps({"urls": list(urls)}).encode(),
            headers={"content-type": "application/json"},
        ).close()

    def _delete_blob(self, url):
        self.delete_blobs([url])

    # --- Storage API ----------------------------------------------------

    def _save(self, name, content):
        StoredFile = self._model()
        if hasattr(content, "seek"):
            content.seek(0)
        data = b"".join(content.chunks()) if hasattr(content, "chunks") else content.read()
        content_type = (getattr(content, "content_type", None) or _guess_type(name))[:100]
        uploader = _current_uploader.get()
        for attempt in range(_SAVE_ATTEMPTS):
            try:
                # The row reserves the name (unique constraint) before any
                # bytes leave; a failed PUT rolls the row back with it.
                with transaction.atomic():
                    row = StoredFile.objects.create(
                        id=_uuid_from_name(name) or uuid.uuid4(),
                        name=name, content=None, size=len(data),
                        content_type=content_type, uploaded_by=uploader,
                    )
                    row.blob_url = self.put_blob(name, data, content_type)
                    row.save(update_fields=["blob_url"])
                return name
            except IntegrityError:
                if attempt == _SAVE_ATTEMPTS - 1:
                    raise
                name = self.get_alternative_name(*self._split(name))
        return name  # pragma: no cover

    def _row(self, **lookup):
        row = (
            self._model().objects.filter(**lookup)
            .values_list("content", "content_type", "blob_url", "size").first()
        )
        if row is None:
            raise FileNotFoundError(lookup.get("name"))
        content, content_type, blob_url, size = row
        content_type = content_type or _guess_type(lookup["name"])
        if content is not None:  # written by DatabaseStorage: bytes are here
            f = ContentFile(bytes(content), name=lookup["name"])
            f.content_type = content_type
            return f
        url = blob_url or self._store_url(lookup["name"])
        return _BlobDownload(self._request("get", "GET", url), lookup["name"], content_type, size)

    def delete(self, name):
        if not name:
            return
        row = self._model().objects.filter(name=name).values_list("content", "blob_url").first()
        if row is None:
            return
        content, blob_url = row
        if content is None:
            try:
                self._delete_blob(blob_url or self._store_url(name))
            except FileNotFoundError:
                pass  # already gone: drop the index row
        # The row goes only once the blob has: a failed delete keeps it, so the
        # quota still counts the bytes and the error is visible in the logs.
        self._model().objects.filter(name=name).delete()


class _BlobDownload:
    """The Blob GET response as a read-only file, streamed by FileResponse.

    `size` comes from the index so the download view can send Content-Length
    without buffering the body."""

    def __init__(self, response, name, content_type, size):
        self._response = response
        self.name = name
        self.content_type = content_type
        self.size = size

    def read(self, size=-1):
        return self._response.read() if size is None or size < 0 else self._response.read(size)

    def close(self):
        self._response.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
