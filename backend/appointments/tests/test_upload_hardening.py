"""Security-review fixes for uploads stored in Postgres (2026-10-08).

1. Storage exhaustion: per-user and per-IP upload rate limits, a per-owner
   byte quota (doctors exempt), a global "storage nearly full" guard, and a
   per-IP limit on public signup (otherwise the per-owner quota is free to
   multiply).
2. Token reuse after delete: uploads get random UUID storage names, and the
   download token is bound to the StoredFile row, not just the name.
3. Download route is rate limited per IP.
4. The unauthenticated /media/ route is gone.
5. File deletion runs on commit, so a rolled-back delete keeps its file.
"""

import os
import uuid
from unittest import mock

from django.core.files.base import ContentFile
from django.db import transaction
from django.test import override_settings

from appointments.models import DiagnosticReport, Pet, QueryAttachment, StoredFile
from appointments.storage import DatabaseStorage, file_token, _signer

from .base import API, ApiTestCase, upload

SHARED = "appointments.views._shared"
FS_STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}


class _Uploads(ApiTestCase):
    def report(self, user=None, name="scan.png", pet=None, **kw):
        if user is not None:
            self.auth(user)
        pet = pet or self.pet_a
        base = "/owner" if user is not None and user.role == "OWNER" else ""
        return self.client.post(f"{API}{base}/pets/{pet.id}/diagnoses",
                                {"file": upload(name, **kw), "report_type": "BLOOD"},
                                format="multipart")


class UploadRateLimitTests(_Uploads):
    def test_per_user_limit_is_429_problem(self):
        with mock.patch(f"{SHARED}.UPLOAD_USER_LIMIT", 2):
            for _ in range(2):
                self.assertEqual(self.report(self.doctor).status_code, 201)
            r = self.report(self.doctor)
        self.assertEqual(r.status_code, 429, r.content)
        self.assertEqual(r.json()["status"], 429)
        self.assertEqual(DiagnosticReport.objects.count(), 2)

    def test_per_ip_limit_spans_users(self):
        with mock.patch(f"{SHARED}.UPLOAD_IP_LIMIT", 2):
            self.assertEqual(self.report(self.doctor).status_code, 201)
            self.assertEqual(self.report(self.owner_a).status_code, 201)
            r = self.report(self.owner_a)
        self.assertEqual(r.status_code, 429, r.content)

    def _exhaust(self, *users):
        """Fill each user's hourly bucket (the limiter always admits the first
        request of a window, so a patched limit of 0 would prove nothing)."""
        from django.core.cache import cache
        for user in users:
            cache.set(f"upload:user:{user.pk}", 1, timeout=3600)

    def test_every_upload_route_is_limited(self):
        owner_routes = [
            ("post", f"{API}/owner/pets/{self.pet_a.id}/diagnoses",
             {"file": upload("a.png"), "report_type": "BLOOD"}),
            ("post", f"{API}/owner/pets/{self.pet_a.id}/queries",
             {"message": "hi", "attachments": [upload("a.png")]}),
            ("post", f"{API}/owner/pets", {"name": "Bo", "species": "Dog", "photo": upload("a.png")}),
        ]
        doctor_routes = [
            ("post", f"{API}/pets/{self.pet_a.id}/diagnoses",
             {"file": upload("a.png"), "report_type": "BLOOD"}),
            ("post", f"{API}/pets/{self.pet_a.id}/queries",
             {"message": "hi", "attachments": [upload("a.png")]}),
            ("patch", f"{API}/pets/{self.pet_a.id}", {"photo": upload("a.png")}),
            ("post", f"{API}/pets", {"name": "Bo", "species": "Dog", "owner_name": "O",
                                     "owner_phone": "9000000009", "photo": upload("a.png")}),
        ]
        with mock.patch(f"{SHARED}.UPLOAD_USER_LIMIT", 1):
            for user, group in ((self.owner_a, owner_routes), (self.doctor, doctor_routes)):
                self.auth(user)
                for method, url, body in group:
                    with self.subTest(url=url, method=method):
                        self._exhaust(user)
                        r = getattr(self.client, method)(url, body, format="multipart")
                        self.assertEqual(r.status_code, 429, r.content)
        self.assertEqual(StoredFile.objects.count(), 0)
        self.assertFalse(Pet.objects.filter(name="Bo").exists())

    def test_requests_without_files_are_not_counted(self):
        self.auth(self.doctor)
        self._exhaust(self.doctor)
        with mock.patch(f"{SHARED}.UPLOAD_USER_LIMIT", 1):
            r = self.client.patch(f"{API}/pets/{self.pet_a.id}", {"breed": "Beagle"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)


class UploadQuotaTests(_Uploads):
    def test_uploads_record_the_uploader(self):
        self.assertEqual(self.report(self.owner_a).status_code, 201)
        self.assertEqual(StoredFile.objects.get().uploaded_by, self.owner_a)

    def test_owner_quota_exceeded_is_400_problem(self):
        size = len(upload("x.png").read())
        with mock.patch(f"{SHARED}.OWNER_UPLOAD_QUOTA_BYTES", size * 2):
            self.assertEqual(self.report(self.owner_a).status_code, 201)
            self.assertEqual(self.report(self.owner_a).status_code, 201)
            r = self.report(self.owner_a)
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn("upload limit", r.json()["detail"].lower())
        self.assertEqual(StoredFile.objects.count(), 2)

    def test_quota_is_per_owner(self):
        size = len(upload("x.png").read())
        with mock.patch(f"{SHARED}.OWNER_UPLOAD_QUOTA_BYTES", size):
            self.assertEqual(self.report(self.owner_a).status_code, 201)
            self.assertEqual(self.report(self.owner_b, pet=self.pet_b).status_code, 201)

    def test_doctors_are_exempt(self):
        with mock.patch(f"{SHARED}.OWNER_UPLOAD_QUOTA_BYTES", 1):
            self.assertEqual(self.report(self.doctor).status_code, 201)

    def test_global_guard_is_503_problem(self):
        self.assertEqual(self.report(self.doctor).status_code, 201)
        with override_settings(FILE_STORAGE_MAX_BYTES=StoredFile.objects.get().size):
            r = self.report(self.doctor)
        self.assertEqual(r.status_code, 503, r.content)
        self.assertEqual(r.json()["detail"],
                         "File storage is nearly full — please contact the clinic.")
        self.assertEqual(StoredFile.objects.count(), 1)

    def test_global_limit_default_is_700_mb(self):
        from django.conf import settings
        self.assertEqual(settings.FILE_STORAGE_MAX_BYTES, 700 * 1024 * 1024)


class SignupRateLimitTests(ApiTestCase):
    def signup(self, i):
        return self.anon().post(f"{API}/auth/signup", {
            "username": f"newowner{i}", "password": "Sup3r-Secret-Pass!",
            "email": f"n{i}@example.com", "phone": f"98765000{i:02d}",
            "first_name": "N", "last_name": "O", "role": "OWNER",
        }, format="json")

    def test_signup_is_limited_per_ip(self):
        with mock.patch("appointments.views.auth.SIGNUP_IP_LIMIT", 2):
            self.assertEqual(self.signup(1).status_code, 201)
            self.assertEqual(self.signup(2).status_code, 201)
            r = self.signup(3)
        self.assertEqual(r.status_code, 429, r.content)
        self.assertEqual(r.json()["status"], 429)


class UuidStorageNameTests(_Uploads):
    UUID_NAME = r"^{}/[0-9a-f]{{32}}\.png$"

    def test_report_names_are_random_but_display_name_is_kept(self):
        r = self.report(self.doctor, name="My Scan.PNG")
        report = DiagnosticReport.objects.get(pk=r.data["id"])
        self.assertRegex(report.file.name, self.UUID_NAME.format("diagnostic_reports"))
        self.assertEqual(report.original_filename, "My Scan.PNG")

    def test_attachment_and_photo_names_are_random(self):
        self.auth(self.owner_a)
        self.client.post(f"{API}/owner/pets/{self.pet_a.id}/queries",
                         {"message": "hi", "attachments": [upload("a.png")]}, format="multipart")
        att = QueryAttachment.objects.get()
        self.assertRegex(att.file.name, self.UUID_NAME.format("query_attachments"))
        self.assertEqual(att.original_filename, "a.png")
        self.auth(self.doctor)
        self.client.patch(f"{API}/pets/{self.pet_a.id}", {"photo": upload("rex.png")}, format="multipart")
        self.pet_a.refresh_from_db()
        self.assertRegex(self.pet_a.photo.name, self.UUID_NAME.format("pets"))


class TokenBindingTests(_Uploads):
    def test_old_token_does_not_open_a_reupload_of_the_same_file(self):
        first = self.report(self.doctor, name="scan.png")
        old_url = first.data["file_url"]
        with self.captureOnCommitCallbacks(execute=True):
            self.client.delete(f"{API}/diagnoses/{first.data['id']}")
        self.assertEqual(self.report(self.doctor, name="scan.png").status_code, 201)
        self.assertEqual(self.anon().get(old_url).status_code, 404)

    def test_token_for_the_right_name_but_another_row_is_404(self):
        storage = DatabaseStorage()
        name = storage.save("x/a.png", ContentFile(b"abc"))
        forged = _signer().sign_object([name, uuid.uuid4().hex])
        self.assertEqual(self.anon().get(f"{API}/files/{forged}").status_code, 404)
        self.assertEqual(self.anon().get(f"{API}/files/{file_token(name)}").status_code, 200)


class DownloadRateLimitTests(_Uploads):
    def test_download_is_limited_per_ip(self):
        url = self.report(self.doctor).data["file_url"]
        self.anon()
        with mock.patch("appointments.views.files.FILE_DOWNLOAD_IP_LIMIT", 2):
            self.assertEqual(self.client.get(url).status_code, 200)
            self.assertEqual(self.client.get(url).status_code, 200)
            r = self.client.get(url)
        self.assertEqual(r.status_code, 429)
        self.assertEqual(r.json()["status"], 429)


class MediaRouteRemovedTests(ApiTestCase):
    """The runner forces DEBUG=False before urls.py is imported, so the old
    DEBUG/SERVE_SPA-only /media/ route never existed in tests. Re-import the
    URLconf under both switches to prove no unauthenticated media route is
    registered in any configuration."""

    def _patterns(self, **flags):
        import importlib
        import petphysio.urls as urls_module
        try:
            with self.settings(**flags):
                mod = importlib.reload(urls_module)
                return [str(p.pattern) for p in mod.urlpatterns]
        finally:
            importlib.reload(urls_module)

    def test_no_media_route_under_debug(self):
        patterns = self._patterns(DEBUG=True, SERVE_SPA=False)
        self.assertFalse([p for p in patterns if p.lstrip("^").startswith("media")], patterns)

    def test_no_media_route_in_single_container_mode(self):
        patterns = self._patterns(DEBUG=False, SERVE_SPA=True)
        self.assertFalse([p for p in patterns if p.lstrip("^").startswith("media")], patterns)


class DeleteOnCommitTests(_Uploads):
    def test_rolled_back_delete_keeps_the_file(self):
        with self.settings(STORAGES=FS_STORAGES):
            r = self.report(self.doctor)
            report = DiagnosticReport.objects.get(pk=r.data["id"])
            path = report.file.path
            with self.captureOnCommitCallbacks(execute=True):
                try:
                    with transaction.atomic():
                        report.delete()
                        raise RuntimeError("roll back")
                except RuntimeError:
                    pass
            self.assertTrue(os.path.exists(path), "file deleted though the delete rolled back")

    def test_committed_delete_removes_the_file(self):
        with self.settings(STORAGES=FS_STORAGES):
            r = self.report(self.doctor)
            path = DiagnosticReport.objects.get(pk=r.data["id"]).file.path
            with self.captureOnCommitCallbacks(execute=True):
                self.client.delete(f"{API}/diagnoses/{r.data['id']}")
            self.assertFalse(os.path.exists(path))

    def test_pet_delete_cascades_to_stored_bytes(self):
        self.report(self.doctor)
        self.assertEqual(StoredFile.objects.count(), 1)
        with self.captureOnCommitCallbacks(execute=True):
            Pet.objects.filter(pk=self.pet_a.pk).delete()
        self.assertEqual(StoredFile.objects.count(), 0)

