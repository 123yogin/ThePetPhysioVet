"""Uploads stored in Postgres, and the signed download route that serves them.

Production runs on Vercel serverless, whose filesystem is read-only, so the
FileSystemStorage default turned every upload into an HTML 500. Uploaded bytes
now live in the `StoredFile` table (appointments/storage.py `DatabaseStorage`)
and are served back by `GET /api/v1/files/<signed-token>`.

The whole ApiTestCase suite runs against DatabaseStorage (tests/base.py); the
FileSystemStorage tests below override it back to prove local dev still works.
"""

import time
from unittest import mock

from django.core import signing
from django.core.files.base import ContentFile
from django.db import DatabaseError
from django.test import SimpleTestCase, TestCase, override_settings

from appointments.models import DiagnosticReport, Pet, QueryAttachment, StoredFile
from appointments.storage import DatabaseStorage, FILE_TOKEN_SALT, file_token

from .base import API, MAGIC, PE_EXECUTABLE, ApiTestCase, upload

MAX_BYTES = 4 * 1024 * 1024  # Vercel caps request bodies at ~4.5 MB
TOO_LARGE = "File is too large (max 4 MB)."
PHOTO_TYPE = "Pet photo must be a JPEG, PNG, WebP or HEIC image."
STORAGE_DOWN = "Upload storage unavailable, please try again."


class DatabaseStorageUnitTests(TestCase):
    def setUp(self):
        self.storage = DatabaseStorage()

    def test_round_trip_keeps_bytes_prefix_and_content_type(self):
        f = upload("scan.png", content_type="image/png")
        name = self.storage.save("diagnostic_reports/scan.png", f)
        self.assertTrue(name.startswith("diagnostic_reports/"), name)
        self.assertTrue(self.storage.exists(name))
        self.assertEqual(self.storage.size(name), len(MAGIC["image/png"]))
        row = StoredFile.objects.get(name=name)
        self.assertEqual(row.content_type, "image/png")
        with self.storage.open(name) as fh:
            self.assertEqual(fh.read(), MAGIC["image/png"])

    def test_same_name_twice_gets_a_unique_name(self):
        a = self.storage.save("pets/rex.png", ContentFile(b"one"))
        b = self.storage.save("pets/rex.png", ContentFile(b"two"))
        self.assertNotEqual(a, b)
        self.assertTrue(b.startswith("pets/"))
        self.assertEqual(StoredFile.objects.count(), 2)

    def test_content_type_guessed_when_not_supplied(self):
        name = self.storage.save("x/report.pdf", ContentFile(b"%PDF-1.4"))
        self.assertEqual(StoredFile.objects.get(name=name).content_type, "application/pdf")

    def test_delete_and_missing_file(self):
        name = self.storage.save("x/a.png", ContentFile(b"abc"))
        self.storage.delete(name)
        self.assertFalse(self.storage.exists(name))
        self.storage.delete(name)  # deleting twice is a no-op, not an error
        with self.assertRaises(FileNotFoundError):
            self.storage.open(name)
        with self.assertRaises(FileNotFoundError):
            self.storage.size(name)

    def test_path_traversal_rejected(self):
        from django.core.exceptions import SuspiciousFileOperation
        with self.assertRaises(SuspiciousFileOperation):
            self.storage.save("../../etc/passwd", ContentFile(b"x"))

    def test_url_is_a_signed_download_link(self):
        name = self.storage.save("x/a.png", ContentFile(b"abc"))
        url = self.storage.url(name)
        self.assertTrue(url.startswith("/api/v1/files/"), url)
        token = url.rsplit("/", 1)[1]
        signer = signing.TimestampSigner(salt=FILE_TOKEN_SALT)
        # Bound to the row as well as the name (security review, 2026-10-08).
        row_id = StoredFile.objects.get(name=name).id.hex
        self.assertEqual(signer.unsign_object(token, max_age=900), [name, row_id])


class StorageSelectionTests(SimpleTestCase):
    """settings._default_storage_backend picks the backend from env."""

    def pick(self, env):
        from petphysio.settings import _default_storage_backend
        return _default_storage_backend(env)

    def test_local_default_is_filesystem(self):
        self.assertEqual(self.pick({}), "django.core.files.storage.FileSystemStorage")

    def test_file_storage_db(self):
        self.assertEqual(self.pick({"FILE_STORAGE": "db"}), "appointments.storage.DatabaseStorage")

    def test_vercel_forces_db(self):
        self.assertEqual(self.pick({"VERCEL": "1"}), "appointments.storage.DatabaseStorage")

    def test_unknown_value_fails_fast(self):
        from django.core.exceptions import ImproperlyConfigured
        with self.assertRaises(ImproperlyConfigured):
            self.pick({"FILE_STORAGE": "s3"})


class DiagnosisUploadAndDownloadTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.auth(self.doctor)

    def _post(self, f, report_type="BLOOD"):
        return self.client.post(f"{API}/pets/{self.pet_a.id}/diagnoses",
                                {"file": f, "report_type": report_type},
                                format="multipart")

    def test_upload_lands_in_the_database(self):
        r = self._post(upload("blood.pdf", content_type="application/pdf"))
        self.assertEqual(r.status_code, 201, r.content)
        report = DiagnosticReport.objects.get(pk=r.data["id"])
        row = StoredFile.objects.get(name=report.file.name)
        self.assertEqual(bytes(row.content), MAGIC["application/pdf"])
        self.assertEqual(row.content_type, "application/pdf")

    def test_signed_url_downloads_bytes_with_safety_headers(self):
        r = self._post(upload("scan.png", content_type="image/png"))
        url = r.data["file_url"]
        self.assertIn("/api/v1/files/", url)
        res = self.anon().get(url)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(b"".join(res.streaming_content), MAGIC["image/png"])
        self.assertEqual(res["Content-Type"], "image/png")
        self.assertTrue(res["Content-Disposition"].startswith("attachment"))
        self.assertEqual(res["X-Content-Type-Options"], "nosniff")

    def test_list_returns_signed_urls(self):
        self._post(upload("scan.png", content_type="image/png"))
        r = self.client.get(f"{API}/pets/{self.pet_a.id}/diagnoses")
        self.assertEqual(r.status_code, 200)
        self.assertIn("/api/v1/files/", r.data[0]["file_url"])

    def test_tampered_token_is_404_json(self):
        url = self._post(upload("scan.png")).data["file_url"]
        res = self.anon().get(url[:-2] + ("AA" if not url.endswith("AA") else "BB"))
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.json()["status"], 404)

    def test_garbage_token_is_404(self):
        res = self.anon().get(f"{API}/files/not-a-token")
        self.assertEqual(res.status_code, 404)

    def test_expired_token_is_404(self):
        r = self._post(upload("scan.png"))
        name = DiagnosticReport.objects.get(pk=r.data["id"]).file.name
        with mock.patch("django.core.signing.time.time", return_value=time.time() - 16 * 60):
            token = file_token(name)
        res = self.anon().get(f"{API}/files/{token}")
        self.assertEqual(res.status_code, 404)

    def test_token_for_deleted_file_is_404(self):
        r = self._post(upload("scan.png"))
        url = r.data["file_url"]
        with self.captureOnCommitCallbacks(execute=True):
            self.client.delete(f"{API}/diagnoses/{r.data['id']}")
        res = self.anon().get(url)
        self.assertEqual(res.status_code, 404)

    def test_deleting_a_report_frees_its_bytes(self):
        r = self._post(upload("scan.png"))
        self.assertEqual(StoredFile.objects.count(), 1)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.delete(f"{API}/diagnoses/{r.data['id']}")
        self.assertEqual(StoredFile.objects.count(), 0)

    def test_token_signed_with_another_salt_is_404(self):
        r = self._post(upload("scan.png"))
        name = DiagnosticReport.objects.get(pk=r.data["id"]).file.name
        token = signing.TimestampSigner(salt="something-else").sign_object(name)
        self.assertEqual(self.anon().get(f"{API}/files/{token}").status_code, 404)

    def test_unexpected_stored_type_served_as_octet_stream(self):
        StoredFile.objects.create(name="x/evil.html", content=b"<script>", size=8,
                                  content_type="text/html")
        # file_token() binds to this row by looking it up.
        res = self.anon().get(f"{API}/files/{file_token('x/evil.html')}")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Content-Type"], "application/octet-stream")

    def test_download_uses_original_filename(self):
        r = self._post(upload("My Scan (final).png"))
        res = self.anon().get(r.data["file_url"])
        self.assertEqual(res.status_code, 200)
        self.assertIn("My Scan (final).png", res["Content-Disposition"])
        self.assertNotIn("diagnostic_reports", res["Content-Disposition"])

    def test_download_filename_is_sanitised_and_rfc5987(self):
        name = DiagnosticReport.objects.get(
            pk=self._post(upload("a.png")).data["id"]).file.name
        token = file_token(name, filename='../../etc/pa"ss\u00e9.png')
        res = self.anon().get(f"{API}/files/{token}")
        disp = res["Content-Disposition"]
        self.assertNotIn("..", disp)
        self.assertNotIn("/", disp.split("filename", 1)[1])
        self.assertIn("filename*=utf-8''", disp)

    def test_token_without_filename_falls_back_to_stored_name(self):
        name = DiagnosticReport.objects.get(
            pk=self._post(upload("a.png")).data["id"]).file.name
        res = self.anon().get(f"{API}/files/{file_token(name)}")
        self.assertIn(name.rsplit("/", 1)[-1], res["Content-Disposition"])

    def test_oversized_upload_is_400_problem(self):
        r = self._post(upload("big.png", content_type="image/png", pad_to=MAX_BYTES + 1))
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["detail"], TOO_LARGE)
        self.assertEqual(StoredFile.objects.count(), 0)

    def test_storage_failure_is_503_problem_not_html(self):
        with mock.patch.object(DatabaseStorage, "_save", side_effect=DatabaseError("boom")):
            r = self._post(upload("scan.png"))
        self.assertEqual(r.status_code, 503)
        self.assertEqual(r.json()["detail"], STORAGE_DOWN)
        self.assertEqual(DiagnosticReport.objects.count(), 0)

    def test_read_only_filesystem_is_503_problem(self):
        with override_settings(STORAGES={
            "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
            "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
        }):
            from django.core.files.storage import FileSystemStorage
            with mock.patch.object(FileSystemStorage, "_save",
                                   side_effect=OSError(30, "Read-only file system")):
                r = self._post(upload("scan.png"))
        self.assertEqual(r.status_code, 503)
        self.assertEqual(r.json()["detail"], STORAGE_DOWN)


class OwnerUploadTests(ApiTestCase):
    def test_owner_oversized_is_400_problem(self):
        self.auth(self.owner_a)
        r = self.client.post(f"{API}/owner/pets/{self.pet_a.id}/diagnoses",
                             {"file": upload("x.png", pad_to=MAX_BYTES + 1), "report_type": "OTHER"},
                             format="multipart")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["detail"], TOO_LARGE)

    def test_owner_sees_downloadable_url(self):
        self.auth(self.owner_a)
        r = self.client.post(f"{API}/owner/pets/{self.pet_a.id}/diagnoses",
                             {"file": upload("x.pdf", content_type="application/pdf"),
                              "report_type": "OTHER"}, format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        res = self.anon().get(r.data["file_url"])
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Content-Type"], "application/pdf")


class QueryAttachmentStorageTests(ApiTestCase):
    def test_attachment_url_is_signed_and_downloads(self):
        self.auth(self.owner_a)
        r = self.client.post(f"{API}/owner/pets/{self.pet_a.id}/queries",
                             {"message": "see attached", "attachments": [upload("a.png")]},
                             format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        url = r.data["attachments"][0]["url"]
        self.assertIn("/api/v1/files/", url)
        res = self.anon().get(url)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(b"".join(res.streaming_content), MAGIC["image/png"])

    def test_oversized_attachment_is_400_problem(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/pets/{self.pet_a.id}/queries",
                             {"message": "hi", "attachments": [upload("a.png", pad_to=MAX_BYTES + 1)]},
                             format="multipart")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["detail"], TOO_LARGE)

    def test_storage_failure_leaves_no_half_message(self):
        self.auth(self.doctor)
        before = self.thread_a.messages.count()
        with mock.patch.object(DatabaseStorage, "_save", side_effect=DatabaseError("boom")):
            r = self.client.post(f"{API}/pets/{self.pet_a.id}/queries",
                                 {"message": "hi", "attachments": [upload("a.png")]},
                                 format="multipart")
        self.assertEqual(r.status_code, 503)
        self.assertEqual(r.json()["detail"], STORAGE_DOWN)
        self.assertEqual(QueryAttachment.objects.count(), 0)
        self.assertEqual(self.thread_a.messages.count(), before)


class PetPhotoStorageTests(ApiTestCase):
    def test_doctor_photo_upload_is_signed_and_downloadable(self):
        self.auth(self.doctor)
        r = self.client.patch(f"{API}/pets/{self.pet_a.id}", {"photo": upload("rex.png")},
                              format="multipart")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn("/api/v1/files/", r.data["photo"])
        res = self.anon().get(r.data["photo"])
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Content-Type"], "image/png")

    def test_replacing_a_photo_frees_the_old_bytes(self):
        self.auth(self.doctor)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.patch(f"{API}/pets/{self.pet_a.id}", {"photo": upload("a.png")}, format="multipart")
            self.client.patch(f"{API}/pets/{self.pet_a.id}", {"photo": upload("b.png")}, format="multipart")
        self.assertEqual(StoredFile.objects.count(), 1)
        self.pet_a.refresh_from_db()
        self.assertTrue(StoredFile.objects.filter(name=self.pet_a.photo.name).exists())

    def test_oversized_photo_rejected_on_every_route(self):
        big = lambda: upload("big.png", pad_to=MAX_BYTES + 1)  # noqa: E731
        self.auth(self.doctor)
        cases = [
            ("patch", f"{API}/pets/{self.pet_a.id}", {"photo": big()}),
            ("post", f"{API}/pets", {"name": "Bo", "species": "Dog", "photo": big()}),
        ]
        for method, url, body in cases:
            with self.subTest(url=url):
                r = getattr(self.client, method)(url, body, format="multipart")
                self.assertEqual(r.status_code, 400, r.content)
                self.assertEqual(r.json()["detail"], TOO_LARGE)
        self.auth(self.owner_a)
        r = self.client.post(f"{API}/owner/pets", {"name": "Bo", "species": "Dog", "photo": big()},
                             format="multipart")
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(r.json()["detail"], TOO_LARGE)
        self.assertEqual(StoredFile.objects.count(), 0)
        self.assertFalse(Pet.objects.filter(name="Bo").exists())

    def test_allowed_photo_types_accepted(self):
        self.auth(self.doctor)
        heic = b"\x00\x00\x00\x18ftypheic" + b"\x00" * 12
        cases = [
            upload("a.png", content_type="image/png"),
            upload("a.jpg", content_type="image/jpeg"),
            upload("a.webp", content_type="image/webp"),
            upload("a.heic", content=heic, content_type="image/heic"),
        ]
        for f in cases:
            with self.subTest(ctype=f.content_type):
                r = self.client.patch(f"{API}/pets/{self.pet_a.id}", {"photo": f}, format="multipart")
                self.assertEqual(r.status_code, 200, r.content)

    def test_non_image_photo_rejected(self):
        self.auth(self.doctor)
        cases = [
            upload("x.pdf", content_type="application/pdf"),
            upload("x.gif", content_type="image/gif"),
            upload("x.html", content=b"<script>alert(1)</script>", content_type="text/html"),
            # An executable wearing an image/png label: sniffed, not trusted.
            upload("x.png", content=PE_EXECUTABLE, content_type="image/png"),
        ]
        for f in cases:
            with self.subTest(ctype=f.content_type, name=f.name):
                r = self.client.patch(f"{API}/pets/{self.pet_a.id}", {"photo": f}, format="multipart")
                self.assertEqual(r.status_code, 400, r.content)
                self.assertEqual(r.json()["detail"], PHOTO_TYPE)
        self.assertEqual(StoredFile.objects.count(), 0)

    def test_bad_photo_type_creates_no_pet_on_either_create_route(self):
        bad = lambda: upload("x.pdf", content_type="application/pdf")  # noqa: E731
        self.auth(self.doctor)
        r = self.client.post(f"{API}/pets", {"name": "Bo", "species": "Dog", "owner_name": "O",
                                             "owner_phone": "9000000009", "photo": bad()},
                             format="multipart")
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(r.json()["detail"], PHOTO_TYPE)
        self.auth(self.owner_a)
        r = self.client.post(f"{API}/owner/pets", {"name": "Bo", "species": "Dog", "photo": bad()},
                             format="multipart")
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(r.json()["detail"], PHOTO_TYPE)
        self.assertFalse(Pet.objects.filter(name="Bo").exists())

    def test_photo_storage_failure_is_503(self):
        self.auth(self.doctor)
        with mock.patch.object(DatabaseStorage, "_save", side_effect=DatabaseError("boom")):
            r = self.client.patch(f"{API}/pets/{self.pet_a.id}", {"photo": upload("a.png")},
                                  format="multipart")
        self.assertEqual(r.status_code, 503)
        self.assertEqual(r.json()["detail"], STORAGE_DOWN)


class FileSystemStorageDownloadTests(ApiTestCase):
    """Local dev keeps FileSystemStorage; the signed route must serve it too."""

    def setUp(self):
        super().setUp()
        # Per-test (not a class decorator): ApiTestCase.setUpClass installs
        # DatabaseStorage after any class-level override would apply.
        fs = self.settings(STORAGES={
            "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
            "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
        })
        fs.enable()
        self.addCleanup(fs.disable)

    def test_signed_download_reads_through_filesystem_storage(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/pets/{self.pet_a.id}/diagnoses",
                             {"file": upload("b.pdf", content_type="application/pdf"),
                              "report_type": "BLOOD"}, format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(StoredFile.objects.count(), 0)
        res = self.anon().get(r.data["file_url"])
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Content-Type"], "application/pdf")
        self.assertEqual(b"".join(res.streaming_content), MAGIC["application/pdf"])
