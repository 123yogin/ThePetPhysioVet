"""Tests for the Sprint-3 clinical features at /api/v1 (DRF, session auth).

Run with:  ./.venv/bin/python manage.py test appointments.test_clinical

Covers SRS §3.4 (diagnostic reports: upload/list/detail/delete/replace,
type + 20MB validation, DICOM detection) and §3.5 (treatment plans + per-
session progress notes, end-date derivation, archive-on-complete + read-only),
plus per-doctor ownership scoping and rich-text sanitisation.

Uploads are written to a throwaway MEDIA_ROOT so the real media/ dir is never
touched and files can be asserted gone after delete/replace.
"""

import datetime
import os
import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import Diagnosis, ProgressNote, TreatmentPlan
from .tests import PASSWORD, make_doctor, make_pet

_MEDIA = tempfile.mkdtemp(prefix="ppv-test-media-")


def _png(name="scan.png", content_type="image/png", size=None):
    data = b"\x89PNG\r\n\x1a\n" + (b"0" * (size - 8)) if size else b"\x89PNG\r\n\x1a\nrest"
    return SimpleUploadedFile(name, data, content_type=content_type)


@override_settings(MEDIA_ROOT=_MEDIA)
class DiagnosisAPITests(TestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.client = APIClient()
        self.doc = make_doctor("drdiag")
        self.client.login(username="drdiag", password=PASSWORD)
        self.pet = make_pet(self.doc)

    def _upload(self, **kw):
        payload = {"report_type": Diagnosis.XRAY, "notes": "<b>ok</b>", "file": _png()}
        payload.update(kw)
        return self.client.post(
            f"/api/v1/pets/{self.pet.id}/diagnoses", payload, format="multipart"
        )

    def test_upload_valid_returns_201_and_persists_metadata(self):
        resp = self._upload()
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["report_type"], "XRAY")
        self.assertEqual(resp.data["report_type_display"], "X-Ray")
        self.assertEqual(resp.data["original_filename"], "scan.png")
        self.assertEqual(resp.data["mime"], "image/png")
        self.assertTrue(resp.data["file_url"].startswith("http"))
        self.assertFalse(resp.data["is_dicom"])
        d = Diagnosis.objects.get(id=resp.data["id"])
        self.assertEqual(d.doctor, self.doc)
        self.assertEqual(d.pet, self.pet)
        self.assertGreater(d.size, 0)

    def test_notes_are_sanitised(self):
        resp = self._upload(notes="<script>alert(1)</script><b>keep</b><a href=x>no</a>")
        self.assertEqual(resp.status_code, 201)
        self.assertNotIn("<script", resp.data["notes"])
        self.assertNotIn("<a", resp.data["notes"])
        self.assertIn("<b>keep</b>", resp.data["notes"])

    def test_upload_bad_type_returns_400(self):
        bad = SimpleUploadedFile("virus.exe", b"MZ...", content_type="application/x-msdownload")
        resp = self._upload(file=bad)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("file", resp.data)
        self.assertFalse(Diagnosis.objects.exists())

    def test_upload_over_20mb_returns_400(self):
        big = SimpleUploadedFile(
            "huge.pdf", b"0" * (20 * 1024 * 1024 + 1), content_type="application/pdf"
        )
        resp = self._upload(report_type=Diagnosis.BLOOD, file=big)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("file", resp.data)
        self.assertIn("20MB", resp.data["file"][0])
        self.assertFalse(Diagnosis.objects.exists())

    def test_upload_bad_report_type_returns_400(self):
        resp = self._upload(report_type="BOGUS")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("report_type", resp.data)

    def test_dicom_flagged(self):
        dcm = SimpleUploadedFile("head.dcm", b"DICM....", content_type="application/dicom")
        resp = self._upload(report_type=Diagnosis.CT, file=dcm)
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.data["is_dicom"])

    def test_upload_to_other_doctors_pet_404(self):
        other_pet = make_pet(make_doctor("drx"), name="NotYours")
        resp = self.client.post(
            f"/api/v1/pets/{other_pet.id}/diagnoses",
            {"report_type": Diagnosis.XRAY, "file": _png()},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 404)
        self.assertFalse(Diagnosis.objects.exists())

    def test_list_newest_first_and_empty_state(self):
        self.assertEqual(self.client.get(f"/api/v1/pets/{self.pet.id}/diagnoses").data, [])
        first = self._upload().data["id"]
        second = self._upload(report_type=Diagnosis.MRI).data["id"]
        data = self.client.get(f"/api/v1/pets/{self.pet.id}/diagnoses").data
        self.assertEqual([r["id"] for r in data], [second, first])  # newest first

    def test_list_scoped_to_owner(self):
        self._upload()
        other = make_doctor("drother")
        other_pet = make_pet(other, name="Theirs")
        Diagnosis.objects.create(
            pet=other_pet, doctor=other, report_type=Diagnosis.XRAY,
            file=SimpleUploadedFile("x.png", b"..", content_type="image/png"),
            original_filename="x.png", mime="image/png", size=2,
        )
        data = self.client.get(f"/api/v1/pets/{self.pet.id}/diagnoses").data
        self.assertEqual(len(data), 1)

    def test_detail_and_other_doctor_404(self):
        did = self._upload().data["id"]
        self.assertEqual(self.client.get(f"/api/v1/diagnoses/{did}").status_code, 200)
        self.client.logout()
        make_doctor("intruder")
        self.client.login(username="intruder", password=PASSWORD)
        self.assertEqual(self.client.get(f"/api/v1/diagnoses/{did}").status_code, 404)

    def test_delete_removes_row_and_file(self):
        did = self._upload().data["id"]
        path = Diagnosis.objects.get(id=did).file.path
        self.assertTrue(os.path.exists(path))
        resp = self.client.delete(f"/api/v1/diagnoses/{did}")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Diagnosis.objects.filter(id=did).exists())
        self.assertFalse(os.path.exists(path))

    def test_delete_other_doctor_404(self):
        did = self._upload().data["id"]
        self.client.logout()
        make_doctor("intruder")
        self.client.login(username="intruder", password=PASSWORD)
        self.assertEqual(self.client.delete(f"/api/v1/diagnoses/{did}").status_code, 404)
        self.assertTrue(Diagnosis.objects.filter(id=did).exists())

    def test_replace_keeps_id_and_swaps_file(self):
        did = self._upload().data["id"]
        old_path = Diagnosis.objects.get(id=did).file.path
        new = SimpleUploadedFile("newscan.png", b"\x89PNG\r\n\x1a\nNEW", content_type="image/png")
        resp = self.client.put(
            f"/api/v1/diagnoses/{did}/file", {"file": new}, format="multipart"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["id"], did)  # same row
        self.assertEqual(resp.data["original_filename"], "newscan.png")
        self.assertFalse(os.path.exists(old_path))  # old file gone
        self.assertTrue(os.path.exists(Diagnosis.objects.get(id=did).file.path))

    def test_replace_bad_type_keeps_original(self):
        did = self._upload().data["id"]
        original = Diagnosis.objects.get(id=did).file.name
        bad = SimpleUploadedFile("x.exe", b"MZ", content_type="application/x-msdownload")
        resp = self.client.patch(
            f"/api/v1/diagnoses/{did}/file", {"file": bad}, format="multipart"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(Diagnosis.objects.get(id=did).file.name, original)


class TreatmentPlanAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.doc = make_doctor("drplan")
        self.client.login(username="drplan", password=PASSWORD)
        self.pet = make_pet(self.doc)

    def _create(self, **kw):
        payload = {
            "therapies": [TreatmentPlan.LASER, TreatmentPlan.HYDROTHERAPY],
            "frequency": TreatmentPlan.DAILY,
            "duration": TreatmentPlan.DUR_4WK,
            "start_date": "2026-07-22",
        }
        payload.update(kw)
        return self.client.post(
            f"/api/v1/pets/{self.pet.id}/treatment-plans", payload, format="json"
        )

    def test_create_defaults_active_and_derives_end_date(self):
        resp = self._create()
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["status"], "ACTIVE")
        self.assertEqual(resp.data["end_date"], "2026-08-19")  # +28 days
        self.assertIsNone(resp.data["completed_at"])
        plan = TreatmentPlan.objects.get(id=resp.data["id"])
        self.assertEqual(plan.doctor, self.doc)

    def test_create_8wk_derives_end_date(self):
        resp = self._create(duration=TreatmentPlan.DUR_8WK)
        self.assertEqual(resp.data["end_date"], "2026-09-16")  # +56 days

    def test_create_no_therapy_400(self):
        resp = self._create(therapies=[])
        self.assertEqual(resp.status_code, 400)
        self.assertIn("therapies", resp.data)

    def test_create_invalid_therapy_400(self):
        resp = self._create(therapies=["FLYING"])
        self.assertEqual(resp.status_code, 400)
        self.assertIn("therapies", resp.data)

    def test_create_custom_frequency_requires_text(self):
        resp = self._create(frequency=TreatmentPlan.FREQ_CUSTOM)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("frequency_custom", resp.data)
        ok = self._create(frequency=TreatmentPlan.FREQ_CUSTOM, frequency_custom="2x/week")
        self.assertEqual(ok.status_code, 201)

    def test_create_custom_duration_requires_text_and_end_date(self):
        resp = self._create(duration=TreatmentPlan.DUR_CUSTOM, duration_custom="10 weeks")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("end_date", resp.data)
        ok = self._create(
            duration=TreatmentPlan.DUR_CUSTOM, duration_custom="10 weeks",
            end_date="2026-10-01",
        )
        self.assertEqual(ok.status_code, 201)
        self.assertEqual(ok.data["end_date"], "2026-10-01")  # captured, not derived

    def test_create_incomplete_400(self):
        resp = self.client.post(
            f"/api/v1/pets/{self.pet.id}/treatment-plans", {}, format="json"
        )
        self.assertEqual(resp.status_code, 400)
        for key in ("therapies", "frequency", "duration", "start_date"):
            self.assertIn(key, resp.data)

    def test_create_other_doctors_pet_404(self):
        other_pet = make_pet(make_doctor("drx"), name="NotYours")
        resp = self.client.post(
            f"/api/v1/pets/{other_pet.id}/treatment-plans",
            {"therapies": [TreatmentPlan.LASER], "frequency": TreatmentPlan.DAILY,
             "duration": TreatmentPlan.DUR_4WK, "start_date": "2026-07-22"},
            format="json",
        )
        self.assertEqual(resp.status_code, 404)

    def test_list_all_statuses_scoped(self):
        self._create()
        self._create(status=TreatmentPlan.ON_HOLD)
        make_doctor("drother")  # noise
        data = self.client.get(f"/api/v1/pets/{self.pet.id}/treatment-plans").data
        self.assertEqual(len(data), 2)

    def test_patch_edits_and_status_change(self):
        pid = self._create().data["id"]
        resp = self.client.patch(
            f"/api/v1/treatment-plans/{pid}",
            {"status": TreatmentPlan.ON_HOLD, "frequency": TreatmentPlan.WEEKLY},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "ON_HOLD")
        self.assertEqual(resp.data["frequency"], "WEEKLY")

    def test_complete_archives_and_stamps_completed_at(self):
        pid = self._create().data["id"]
        resp = self.client.patch(
            f"/api/v1/treatment-plans/{pid}", {"status": TreatmentPlan.COMPLETED},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "COMPLETED")
        self.assertIsNotNone(resp.data["completed_at"])

    def test_completed_plan_is_read_only(self):
        pid = self._create().data["id"]
        self.client.patch(
            f"/api/v1/treatment-plans/{pid}", {"status": TreatmentPlan.COMPLETED},
            format="json",
        )
        resp = self.client.patch(
            f"/api/v1/treatment-plans/{pid}", {"frequency": TreatmentPlan.WEEKLY},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("non_field_errors", resp.data)

    def test_detail_other_doctor_404(self):
        pid = self._create().data["id"]
        self.client.logout()
        make_doctor("intruder")
        self.client.login(username="intruder", password=PASSWORD)
        self.assertEqual(self.client.get(f"/api/v1/treatment-plans/{pid}").status_code, 404)
        self.assertEqual(
            self.client.patch(
                f"/api/v1/treatment-plans/{pid}", {"status": TreatmentPlan.ON_HOLD},
                format="json",
            ).status_code,
            404,
        )


class ProgressNoteAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.doc = make_doctor("drnote")
        self.client.login(username="drnote", password=PASSWORD)
        self.pet = make_pet(self.doc)
        self.plan = TreatmentPlan.objects.create(
            pet=self.pet, doctor=self.doc,
            therapies=[TreatmentPlan.LASER], frequency=TreatmentPlan.DAILY,
            duration=TreatmentPlan.DUR_4WK, start_date=datetime.date(2026, 7, 22),
        )

    def _url(self, pid=None):
        return f"/api/v1/treatment-plans/{pid or self.plan.id}/progress-notes"

    def test_add_note_ok_and_sanitised(self):
        resp = self.client.post(
            self._url(),
            {"session_no": 1, "notes": "<script>x</script><b>walked 10m</b>"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertNotIn("<script", resp.data["notes"])
        self.assertIn("<b>walked 10m</b>", resp.data["notes"])
        self.assertEqual(ProgressNote.objects.filter(plan=self.plan).count(), 1)

    def test_empty_note_400(self):
        for notes in ("", "   ", "<p></p>", "<b></b>"):
            resp = self.client.post(
                self._url(), {"session_no": 1, "notes": notes}, format="json"
            )
            self.assertEqual(resp.status_code, 400, notes)
            self.assertIn("notes", resp.data)
        self.assertFalse(ProgressNote.objects.exists())

    def test_notes_returned_chronological(self):
        for n in (2, 1, 3):
            self.client.post(
                self._url(), {"session_no": n, "notes": f"s{n}"}, format="json"
            )
        data = self.client.get(self._url()).data
        self.assertEqual([r["session_no"] for r in data], [1, 2, 3])

    def test_note_on_completed_plan_rejected(self):
        self.plan.status = TreatmentPlan.COMPLETED
        self.plan.save(update_fields=["status"])
        resp = self.client.post(
            self._url(), {"session_no": 1, "notes": "late"}, format="json"
        )
        self.assertEqual(resp.status_code, 400)

    def test_note_on_hold_plan_allowed(self):
        self.plan.status = TreatmentPlan.ON_HOLD
        self.plan.save(update_fields=["status"])
        resp = self.client.post(
            self._url(), {"session_no": 1, "notes": "paused"}, format="json"
        )
        self.assertEqual(resp.status_code, 201)

    def test_other_doctor_404(self):
        self.client.logout()
        make_doctor("intruder")
        self.client.login(username="intruder", password=PASSWORD)
        self.assertEqual(self.client.get(self._url()).status_code, 404)
        self.assertEqual(
            self.client.post(
                self._url(), {"session_no": 1, "notes": "x"}, format="json"
            ).status_code,
            404,
        )


class PetDetailAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.doc = make_doctor("drpetdetail")
        self.client.login(username="drpetdetail", password=PASSWORD)
        self.pet = make_pet(self.doc)

    def test_get_own_pet(self):
        resp = self.client.get(f"/api/v1/pets/{self.pet.id}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["name"], self.pet.name)
        for key in ("pet_type", "owner_name", "notes"):
            self.assertIn(key, resp.data)

    def test_other_doctors_pet_404(self):
        other_pet = make_pet(make_doctor("drx"), name="NotYours")
        self.assertEqual(self.client.get(f"/api/v1/pets/{other_pet.id}").status_code, 404)


class ClinicalModelTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.doc = make_doctor("drmodel")
        self.pet = make_pet(self.doc)

    def test_diagnosis_is_dicom_by_mime_and_extension(self):
        d = Diagnosis(mime="application/dicom", original_filename="a.png")
        self.assertTrue(d.is_dicom)
        d = Diagnosis(mime="application/octet-stream", original_filename="scan.DCM")
        self.assertTrue(d.is_dicom)
        d = Diagnosis(mime="image/png", original_filename="scan.png")
        self.assertFalse(d.is_dicom)

    def test_diagnosis_ordering_newest_first(self):
        f = lambda: SimpleUploadedFile("x.png", b"..", content_type="image/png")
        older = Diagnosis.objects.create(
            pet=self.pet, doctor=self.doc, report_type=Diagnosis.XRAY,
            file=f(), original_filename="x.png", mime="image/png", size=2,
        )
        newer = Diagnosis.objects.create(
            pet=self.pet, doctor=self.doc, report_type=Diagnosis.MRI,
            file=f(), original_filename="y.png", mime="image/png", size=2,
        )
        self.assertEqual(list(Diagnosis.objects.all()), [newer, older])

    def test_progress_note_ordering_by_session_no(self):
        plan = TreatmentPlan.objects.create(
            pet=self.pet, doctor=self.doc, therapies=[TreatmentPlan.LASER],
            frequency=TreatmentPlan.DAILY, duration=TreatmentPlan.DUR_4WK,
            start_date=datetime.date(2026, 7, 22),
        )
        for n in (3, 1, 2):
            ProgressNote.objects.create(plan=plan, session_no=n, notes="x")
        self.assertEqual([p.session_no for p in plan.progress_notes.all()], [1, 2, 3])
