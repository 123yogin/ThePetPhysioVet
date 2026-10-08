"""Uploads in a private Vercel Blob store (appointments/storage_blob.py).

No test touches the network: `FakeBlob` stands in for the urllib opener the
backend sends every request through, and answers the way the Blob API does
(the HTTP calls mirror @vercel/blob 2.8.1 -- see storage_blob.py). It records
each request so the tests can assert on method, URL, headers and timeout.
"""

import io
import json
import logging
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from unittest import mock
from urllib.parse import parse_qs, urlsplit

from django.core.exceptions import ImproperlyConfigured
from django.core.files.base import ContentFile
from django.core.management import CommandError, call_command
from django.test import SimpleTestCase, TestCase, override_settings

from appointments import storage_blob
from appointments.models import DiagnosticReport, StoredFile
from appointments.storage import attribute_uploads_to, file_token
from appointments.storage_blob import BlobStorage

from .base import API, MAGIC, ApiTestCase, upload

TOKEN = "vercel_blob_rw_teststore123_S3cretSecretValue0001"
STORE_HOST = "teststore123.private.blob.vercel-storage.com"
API_ROOT = "https://vercel.com/api/blob"
STORAGE_DOWN = "Upload storage unavailable, please try again."

BLOB_STORAGES = {
    "default": {"BACKEND": "appointments.storage_blob.BlobStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}


class _Resp(io.BytesIO):
    def __init__(self, body, status=200, headers=None):
        super().__init__(body)
        self.status = status
        self.headers = headers or {}

    def getcode(self):
        return self.status


class FakeBlob:
    """In-memory private Blob store behind a urllib-opener interface."""

    def __init__(self):
        self.blobs = {}  # pathname -> (bytes, content_type)
        self.requests = []
        self.fail_with = None  # HTTP status to answer every request with
        self.uploaded_at = {}  # pathname -> ISO timestamp (default: now)
        self.page_size = 1000

    def _error(self, req, status, code):
        body = json.dumps({"error": {"code": code, "message": code}}).encode()
        return urllib.error.HTTPError(req.full_url, status, code, {}, io.BytesIO(body))

    def open(self, req, timeout=None):
        headers = {k.lower(): v for k, v in req.header_items()}
        self.requests.append({
            "method": req.get_method(), "url": req.full_url,
            "headers": headers, "timeout": timeout, "data": req.data,
        })
        if self.fail_with:
            raise self._error(req, self.fail_with, "internal_server_error")
        if headers.get("authorization") != f"Bearer {TOKEN}":
            raise self._error(req, 403, "forbidden")
        parts = urlsplit(req.full_url)
        method = req.get_method()
        if parts.netloc == STORE_HOST and method == "GET":
            pathname = parts.path.lstrip("/")
            if pathname not in self.blobs:
                raise self._error(req, 404, "not_found")
            data, ctype = self.blobs[pathname]
            return _Resp(data, headers={"content-type": ctype})
        if req.full_url.startswith(API_ROOT + "/?") and method == "PUT":
            pathname = parse_qs(parts.query)["pathname"][0]
            if pathname in self.blobs and headers.get("x-allow-overwrite") != "1":
                raise self._error(req, 400, "bad_request")
            self.blobs[pathname] = (req.data, headers.get("x-content-type", ""))
            url = f"https://{STORE_HOST}/{pathname}"
            return _Resp(json.dumps({
                "url": url, "downloadUrl": url + "?download=1", "pathname": pathname,
                "contentType": headers.get("x-content-type", ""),
                "contentDisposition": "", "etag": '"e1"',
            }).encode())
        if req.full_url.startswith(API_ROOT + "?") and method == "GET":  # list()
            q = parse_qs(parts.query)
            names = sorted(self.blobs)
            start = int(q.get("cursor", ["0"])[0])
            limit = min(int(q.get("limit", ["1000"])[0]), self.page_size)
            page = names[start:start + limit]
            more = start + limit < len(names)
            now = datetime.now(timezone.utc).isoformat()
            return _Resp(json.dumps({
                "blobs": [{"url": f"https://{STORE_HOST}/{n}", "pathname": n,
                           "size": len(self.blobs[n][0]),
                           "uploadedAt": self.uploaded_at.get(n, now), "etag": '"e"'}
                          for n in page],
                "cursor": str(start + limit) if more else None, "hasMore": more,
            }).encode())
        if req.full_url == API_ROOT + "/delete" and method == "POST":
            for url in json.loads(req.data)["urls"]:
                self.blobs.pop(urlsplit(url).path.lstrip("/"), None)
            return _Resp(b"")
        raise AssertionError(f"unexpected Blob call {method} {req.full_url}")


class BlobTestMixin:
    def setUp(self):
        super().setUp()
        self.blob = FakeBlob()
        patcher = mock.patch.object(storage_blob, "_OPENER", self.blob)
        patcher.start()
        self.addCleanup(patcher.stop)
        tok = self.settings(BLOB_READ_WRITE_TOKEN=TOKEN)
        tok.enable()
        self.addCleanup(tok.disable)


class BlobStorageUnitTests(BlobTestMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.storage = BlobStorage()

    def test_save_puts_private_blob_at_our_name_and_indexes_it(self):
        name = self.storage.save("diagnostic_reports/" + "a" * 32 + ".png",
                                 ContentFile(MAGIC["image/png"]))
        self.assertEqual(name, "diagnostic_reports/" + "a" * 32 + ".png")
        put = self.blob.requests[-1]
        self.assertEqual(put["method"], "PUT")
        self.assertEqual(put["url"], f"{API_ROOT}/?pathname=diagnostic_reports%2F{'a' * 32}.png")
        h = put["headers"]
        self.assertEqual(h["authorization"], f"Bearer {TOKEN}")
        self.assertEqual(h["x-api-version"], "12")
        self.assertEqual(h["x-vercel-blob-access"], "private")
        self.assertEqual(h["x-add-random-suffix"], "0")
        self.assertEqual(h["x-allow-overwrite"], "0")
        self.assertEqual(h["x-content-type"], "image/png")
        self.assertEqual(put["timeout"], 10)
        self.assertEqual(put["data"], MAGIC["image/png"])

        row = StoredFile.objects.get(name=name)
        self.assertIsNone(row.content)  # bytes live in Blob, not Postgres
        self.assertEqual(row.size, len(MAGIC["image/png"]))
        self.assertEqual(row.content_type, "image/png")
        self.assertEqual(row.blob_url, f"https://{STORE_HOST}/{name}")
        self.assertEqual(row.id.hex, "a" * 32)

    def test_save_records_the_uploader_for_the_quota(self):
        from appointments.models import UserProfile
        user = UserProfile.objects.create_user(username="u1", password="x", role="OWNER")
        with attribute_uploads_to(user):
            name = self.storage.save("pets/p.png", ContentFile(b"abc"))
        self.assertEqual(StoredFile.objects.get(name=name).uploaded_by, user)

    def test_open_reads_with_bearer_from_private_url(self):
        name = self.storage.save("x/a.png", ContentFile(b"hello"))
        with self.storage.open(name) as fh:
            self.assertEqual(fh.read(), b"hello")
            self.assertEqual(fh.content_type, "image/png")
        get = self.blob.requests[-1]
        self.assertEqual(get["method"], "GET")
        self.assertEqual(get["url"], f"https://{STORE_HOST}/{name}")
        self.assertEqual(get["headers"]["authorization"], f"Bearer {TOKEN}")
        self.assertEqual(get["timeout"], 10)

    def test_exists_and_size_come_from_the_index_without_http(self):
        name = self.storage.save("x/a.png", ContentFile(b"hello"))
        calls = len(self.blob.requests)
        self.assertTrue(self.storage.exists(name))
        self.assertFalse(self.storage.exists("x/missing.png"))
        self.assertEqual(self.storage.size(name), 5)
        self.assertEqual(len(self.blob.requests), calls)

    def test_delete_removes_blob_and_row(self):
        name = self.storage.save("x/a.png", ContentFile(b"hello"))
        self.storage.delete(name)
        dele = self.blob.requests[-1]
        self.assertEqual((dele["method"], dele["url"]), ("POST", f"{API_ROOT}/delete"))
        self.assertEqual(json.loads(dele["data"]), {"urls": [f"https://{STORE_HOST}/{name}"]})
        self.assertEqual(dele["headers"]["content-type"], "application/json")
        self.assertEqual(self.blob.blobs, {})
        self.assertFalse(StoredFile.objects.filter(name=name).exists())
        self.storage.delete(name)  # twice is a no-op
        with self.assertRaises(FileNotFoundError):
            self.storage.open(name)

    def test_failed_put_leaves_no_row_and_no_token_in_error(self):
        self.blob.fail_with = 500
        with self.assertRaises(OSError) as ctx:
            self.storage.save("x/a.png", ContentFile(b"hello"))
        self.assertNotIn(TOKEN, str(ctx.exception))
        self.assertNotIn(TOKEN, repr(ctx.exception.args))
        self.assertEqual(StoredFile.objects.count(), 0)

    def test_failed_delete_keeps_row_so_quota_and_retry_still_see_it(self):
        name = self.storage.save("x/a.png", ContentFile(b"hello"))
        self.blob.fail_with = 503
        with self.assertRaises(OSError):
            self.storage.delete(name)
        self.assertTrue(StoredFile.objects.filter(name=name).exists())

    def test_missing_blob_is_file_not_found(self):
        name = self.storage.save("x/a.png", ContentFile(b"hello"))
        self.blob.blobs.clear()
        with self.assertRaises(FileNotFoundError):
            self.storage.open(name)

    def test_token_never_sent_to_a_non_blob_host(self):
        name = self.storage.save("x/a.png", ContentFile(b"hello"))
        StoredFile.objects.filter(name=name).update(blob_url="https://evil.example/x/a.png")
        calls = len(self.blob.requests)
        with self.assertRaises(FileNotFoundError):
            self.storage.open(name)
        self.assertEqual(len(self.blob.requests), calls)

    def test_database_rows_still_read_from_postgres(self):
        StoredFile.objects.create(name="x/old.pdf", content=b"%PDF-old", size=8,
                                  content_type="application/pdf")
        calls = len(self.blob.requests)
        with self.storage.open("x/old.pdf") as fh:
            self.assertEqual(fh.read(), b"%PDF-old")
        self.storage.delete("x/old.pdf")  # a DB row needs no Blob call either
        self.assertEqual(len(self.blob.requests), calls)
        self.assertFalse(StoredFile.objects.exists())

    def test_redirects_are_not_followed(self):
        handler = storage_blob._NoRedirect()
        req = urllib.request.Request(f"https://{STORE_HOST}/x", headers={"Authorization": "Bearer t"})
        self.assertIsNone(handler.redirect_request(req, None, 302, "Found", {}, "https://evil.example/"))

    def test_no_token_configured_is_an_os_error(self):
        with self.settings(BLOB_READ_WRITE_TOKEN=""):
            with self.assertRaises(OSError):
                BlobStorage().save("x/a.png", ContentFile(b"x"))


class StorageSelectionTests(SimpleTestCase):
    def pick(self, env):
        from petphysio.settings import _default_storage_backend
        return _default_storage_backend(env)

    BLOB = "appointments.storage_blob.BlobStorage"
    DB = "appointments.storage.DatabaseStorage"
    FS = "django.core.files.storage.FileSystemStorage"

    def test_explicit_blob_with_token(self):
        self.assertEqual(self.pick({"FILE_STORAGE": "blob", "BLOB_READ_WRITE_TOKEN": TOKEN}), self.BLOB)

    def test_explicit_blob_without_token_fails_fast(self):
        with self.assertRaises(ImproperlyConfigured):
            self.pick({"FILE_STORAGE": "blob"})

    def test_explicit_blob_with_malformed_token_fails_fast(self):
        with self.assertRaises(ImproperlyConfigured) as ctx:
            self.pick({"FILE_STORAGE": "blob", "BLOB_READ_WRITE_TOKEN": "not-a-token-xyz"})
        self.assertNotIn("not-a-token-xyz", str(ctx.exception))

    def test_token_selects_blob_only_in_vercel_production(self):
        env = {"BLOB_READ_WRITE_TOKEN": TOKEN, "VERCEL": "1", "VERCEL_ENV": "production"}
        self.assertEqual(self.pick(env), self.BLOB)

    def test_token_on_vercel_preview_or_development_uses_db(self):
        for vercel_env in ("preview", "development"):
            with self.subTest(vercel_env=vercel_env):
                env = {"BLOB_READ_WRITE_TOKEN": TOKEN, "VERCEL": "1", "VERCEL_ENV": vercel_env}
                self.assertEqual(self.pick(env), self.DB)

    def test_pulled_token_locally_keeps_filesystem(self):
        self.assertEqual(self.pick({"BLOB_READ_WRITE_TOKEN": TOKEN}), self.FS)
        self.assertEqual(
            self.pick({"BLOB_READ_WRITE_TOKEN": TOKEN, "VERCEL_ENV": "development"}), self.FS)

    def test_explicit_blob_is_honoured_anywhere(self):
        for extra in ({}, {"VERCEL": "1", "VERCEL_ENV": "preview"}):
            with self.subTest(extra=extra):
                env = {"FILE_STORAGE": "blob", "BLOB_READ_WRITE_TOKEN": TOKEN, **extra}
                self.assertEqual(self.pick(env), self.BLOB)

    def test_explicit_db_and_filesystem_win_over_token(self):
        prod = {"BLOB_READ_WRITE_TOKEN": TOKEN, "VERCEL": "1", "VERCEL_ENV": "production"}
        self.assertEqual(self.pick({**prod, "FILE_STORAGE": "db"}), self.DB)
        self.assertEqual(self.pick({**prod, "FILE_STORAGE": "filesystem"}), self.FS)

    def test_vercel_without_token_falls_back_to_db(self):
        self.assertEqual(self.pick({"VERCEL": "1"}), self.DB)
        self.assertEqual(self.pick({"VERCEL": "1", "VERCEL_ENV": "production"}), self.DB)

    def test_local_default_is_filesystem(self):
        self.assertEqual(self.pick({}), self.FS)


class BlobApiTests(BlobTestMixin, ApiTestCase):
    def setUp(self):
        super().setUp()
        st = self.settings(STORAGES=BLOB_STORAGES)
        st.enable()
        self.addCleanup(st.disable)
        self.auth(self.doctor)

    def _post(self, f):
        return self.client.post(f"{API}/pets/{self.pet_a.id}/diagnoses",
                                {"file": f, "report_type": "BLOOD"}, format="multipart")

    def test_upload_goes_to_blob_and_signed_download_streams_it(self):
        r = self._post(upload("My Scan (final).png"))
        self.assertEqual(r.status_code, 201, r.content)
        name = DiagnosticReport.objects.get(pk=r.data["id"]).file.name
        self.assertIn(name, self.blob.blobs)
        self.assertIsNone(StoredFile.objects.get(name=name).content)
        self.assertNotIn("vercel-storage", r.data["file_url"])  # never a raw blob URL

        res = self.anon().get(r.data["file_url"])
        self.assertEqual(res.status_code, 200)
        self.assertEqual(b"".join(res.streaming_content), MAGIC["image/png"])
        self.assertEqual(res["Content-Type"], "image/png")
        self.assertEqual(res["Content-Length"], str(len(MAGIC["image/png"])))
        self.assertTrue(res["Content-Disposition"].startswith("attachment"))
        self.assertIn("My Scan (final).png", res["Content-Disposition"])
        self.assertEqual(res["X-Content-Type-Options"], "nosniff")

    def test_owner_quota_still_sums_blob_rows(self):
        self.auth(self.owner_a)
        r = self.client.post(f"{API}/owner/pets/{self.pet_a.id}/diagnoses",
                             {"file": upload("x.pdf", content_type="application/pdf"),
                              "report_type": "OTHER"}, format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        row = StoredFile.objects.get()
        self.assertEqual(row.uploaded_by, self.owner_a)
        self.assertEqual(row.size, len(MAGIC["application/pdf"]))

    def test_delete_on_commit_removes_the_blob(self):
        r = self._post(upload("scan.png"))
        url = r.data["file_url"]
        with self.captureOnCommitCallbacks(execute=True):
            self.client.delete(f"{API}/diagnoses/{r.data['id']}")
        self.assertEqual(self.blob.blobs, {})
        self.assertEqual(StoredFile.objects.count(), 0)
        self.assertEqual(self.anon().get(url).status_code, 404)

    def test_legacy_database_row_still_downloads(self):
        StoredFile.objects.create(name="diagnostic_reports/legacy.pdf", content=b"%PDF-1.4 old",
                                  size=12, content_type="application/pdf")
        res = self.anon().get(f"{API}/files/{file_token('diagnostic_reports/legacy.pdf')}")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(b"".join(res.streaming_content), b"%PDF-1.4 old")
        self.assertEqual(self.blob.requests, [])

    def test_blob_outage_is_503_problem_and_token_never_logged(self):
        self.blob.fail_with = 500
        with self.assertLogs(level=logging.DEBUG) as logs:
            r = self._post(upload("scan.png"))
        self.assertEqual(r.status_code, 503)
        self.assertEqual(r.json()["detail"], STORAGE_DOWN)
        self.assertEqual(DiagnosticReport.objects.count(), 0)
        self.assertEqual(StoredFile.objects.count(), 0)
        handler_text = "\n".join(logs.output)
        self.assertIn("upload storage failed", handler_text)
        self.assertNotIn(TOKEN, handler_text)
        self.assertNotIn(TOKEN.split("_")[-1], handler_text)

    def test_failed_blob_delete_is_logged_without_token(self):
        r = self._post(upload("scan.png"))
        self.blob.fail_with = 500
        with self.assertLogs("appointments.storage", level="ERROR") as logs:
            with self.captureOnCommitCallbacks(execute=True):
                self.client.delete(f"{API}/diagnoses/{r.data['id']}")
        self.assertNotIn(TOKEN, "\n".join(logs.output))


class MigrateFilesToBlobCommandTests(BlobTestMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.a = StoredFile.objects.create(name="pets/a.png", content=b"AAA", size=3,
                                           content_type="image/png")
        self.b = StoredFile.objects.create(name="query_attachments/b.pdf", content=b"%PDF-B",
                                           size=6, content_type="application/pdf")

    def run_cmd(self, *args):
        out = io.StringIO()
        call_command("migrate_files_to_blob", *args, stdout=out)
        return out.getvalue()

    def test_dry_run_changes_nothing(self):
        out = self.run_cmd()
        self.assertIn("2 file(s)", out)
        self.assertIn("--apply", out)
        self.assertEqual(self.blob.requests, [])
        self.assertEqual(bytes(StoredFile.objects.get(pk=self.a.pk).content), b"AAA")

    def test_apply_copies_bytes_and_clears_the_column(self):
        out = self.run_cmd("--apply")
        self.assertIn("Copied 2 file(s)", out)
        self.assertEqual(self.blob.blobs["pets/a.png"], (b"AAA", "image/png"))
        self.assertEqual(self.blob.blobs["query_attachments/b.pdf"][0], b"%PDF-B")
        for row in StoredFile.objects.all():
            self.assertIsNone(row.content)
            self.assertEqual(row.blob_url, f"https://{STORE_HOST}/{row.name}")
        # Readable through BlobStorage afterwards; rerun is a no-op.
        with BlobStorage().open("pets/a.png") as fh:
            self.assertEqual(fh.read(), b"AAA")
        calls = len(self.blob.requests)
        self.assertIn("0 file(s)", self.run_cmd("--apply"))
        self.assertEqual(len(self.blob.requests), calls)

    def test_apply_overwrites_a_blob_left_by_an_interrupted_run(self):
        self.blob.blobs["pets/a.png"] = (b"AAA", "image/png")
        self.run_cmd("--apply")
        self.assertIsNone(StoredFile.objects.get(pk=self.a.pk).content)

    def test_apply_failure_keeps_bytes_in_postgres_and_hides_token(self):
        self.blob.fail_with = 500
        with self.assertRaises(CommandError) as ctx:
            self.run_cmd("--apply")
        self.assertNotIn(TOKEN, str(ctx.exception))
        self.assertEqual(StoredFile.objects.filter(content__isnull=False).count(), 2)

    @override_settings(BLOB_READ_WRITE_TOKEN="")
    def test_apply_without_token_refuses(self):
        with self.assertRaises(CommandError):
            self.run_cmd("--apply")


class CleanupOrphanBlobsCommandTests(BlobTestMixin, TestCase):
    OLD = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()

    def setUp(self):
        super().setUp()
        self.storage = BlobStorage()
        self.kept = self.storage.save("pets/kept.png", ContentFile(b"K"))
        self.blob.uploaded_at[self.kept] = self.OLD
        self.blob.blobs["pets/orphan.png"] = (b"O", "image/png")
        self.blob.uploaded_at["pets/orphan.png"] = self.OLD
        self.blob.blobs["pets/young.png"] = (b"Y", "image/png")  # uploaded just now

    def run_cmd(self, *args):
        out = io.StringIO()
        call_command("cleanup_orphan_blobs", *args, stdout=out)
        return out.getvalue()

    def test_list_call_shape(self):
        self.run_cmd()
        listing = [r for r in self.blob.requests if r["url"].startswith(API_ROOT + "?")][0]
        self.assertEqual(listing["method"], "GET")
        self.assertEqual(listing["headers"]["authorization"], f"Bearer {TOKEN}")
        self.assertEqual(listing["headers"]["x-api-version"], "12")
        self.assertEqual(listing["timeout"], 10)

    def test_dry_run_lists_only_old_unindexed_blobs(self):
        out = self.run_cmd()
        self.assertIn("pets/orphan.png", out)
        self.assertNotIn("pets/young.png", out)
        self.assertNotIn(self.kept, out)
        self.assertIn("--apply", out)
        self.assertFalse(any(r["method"] == "POST" for r in self.blob.requests))
        self.assertIn("pets/orphan.png", self.blob.blobs)

    def test_apply_deletes_only_orphans(self):
        out = self.run_cmd("--apply")
        self.assertIn("Deleted 1 orphan blob(s)", out)
        self.assertEqual(set(self.blob.blobs), {self.kept, "pets/young.png"})
        self.assertTrue(StoredFile.objects.filter(name=self.kept).exists())

    def test_follows_pagination(self):
        self.blob.page_size = 1
        for i in range(3):
            self.blob.blobs[f"query_attachments/o{i}.pdf"] = (b"x", "application/pdf")
            self.blob.uploaded_at[f"query_attachments/o{i}.pdf"] = self.OLD
        self.run_cmd("--apply")
        self.assertEqual(set(self.blob.blobs), {self.kept, "pets/young.png"})

    def test_listing_failure_is_command_error_without_token(self):
        self.blob.fail_with = 500
        with self.assertRaises(CommandError) as ctx:
            self.run_cmd()
        self.assertNotIn(TOKEN, str(ctx.exception))

    @override_settings(BLOB_READ_WRITE_TOKEN="")
    def test_without_token_refuses(self):
        with self.assertRaises(CommandError):
            self.run_cmd()
