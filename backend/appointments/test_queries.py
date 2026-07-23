"""Tests for the Owner <-> Doctor query threads at /api/v1 (SRS §3.9) — Sprint 7.

Run with:  ./.venv/bin/python manage.py test appointments.test_queries

Covers the doctor-side inbox + per-pet thread: append-only audit trail
(PUT/PATCH/DELETE -> 405, no row removal), the 5-image cap (6 -> 400, 0 rows),
atomic type + size rejection, doctor-reply attribution (server-side sender/role),
multi-doctor thread isolation (404), inbox ordering + awaiting_reply, and thread
reachability via ``pets/{id}/queries``.

Uploads land in a throwaway MEDIA_ROOT so the real media/ dir is never touched.
"""

import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Query, QueryAttachment, QueryMessage
from .tests import PASSWORD, make_doctor, make_pet

_MEDIA = tempfile.mkdtemp(prefix="ppv-test-qmedia-")


def _png(name="scan.png", content_type="image/png", size=None):
    head = b"\x89PNG\r\n\x1a\n"
    data = head + (b"0" * (size - len(head))) if size else head + b"rest"
    return SimpleUploadedFile(name, data, content_type=content_type)


@override_settings(MEDIA_ROOT=_MEDIA)
class QueryThreadTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.client = APIClient()
        self.doc = make_doctor("drquery")
        self.doc.first_name = "Ravi"
        self.doc.last_name = "Sharma"
        self.doc.save()
        self.client.login(username="drquery", password=PASSWORD)
        self.pet = make_pet(self.doc)

    def _url(self, pet=None):
        return f"/api/v1/pets/{(pet or self.pet).id}/queries"

    def _post(self, message="How is Bruno?", files=None, pet=None):
        payload = {"message": message}
        if files:
            payload["attachments"] = files
        return self.client.post(self._url(pet), payload, format="multipart")

    # -- thread reachability + doctor reply attribution ---------------------
    def test_empty_thread_returns_pet_and_no_messages(self):
        resp = self.client.get(self._url())
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["pet"]["id"], self.pet.id)
        self.assertEqual(resp.data["pet"]["name"], self.pet.name)
        self.assertEqual(resp.data["messages"], [])
        self.assertFalse(Query.objects.exists())  # lazily created on first post

    def test_post_creates_doctor_message_201_with_server_side_role(self):
        # Client tries to spoof sender_role -> must be ignored (server sets DOCTOR).
        resp = self.client.post(
            self._url(),
            {"message": "Reply from vet", "sender_role": "OWNER", "sender": 999},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["sender_role"], "DOCTOR")
        self.assertEqual(resp.data["sender_name"], "Ravi Sharma")
        self.assertEqual(resp.data["message"], "Reply from vet")
        self.assertEqual(resp.data["attachments"], [])
        msg = QueryMessage.objects.get(id=resp.data["id"])
        self.assertEqual(msg.sender, self.doc)
        self.assertEqual(msg.sender_role, QueryMessage.DOCTOR)
        # Query auto-created + last_message_at bumped.
        query = Query.objects.get(pet=self.pet)
        self.assertIsNotNone(query.last_message_at)

    def test_post_with_attachments_persists_and_returns_urls(self):
        resp = self._post(files=[_png("a.png"), _png("b.jpg", "image/jpeg")])
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(len(resp.data["attachments"]), 2)
        for att in resp.data["attachments"]:
            self.assertTrue(att["url"].startswith("http"))
            self.assertIn(att["mime"], ("image/png", "image/jpeg"))
            self.assertGreater(att["size"], 0)
        self.assertEqual(QueryAttachment.objects.count(), 2)

    def test_thread_get_orders_oldest_to_newest(self):
        self._post(message="first")
        self._post(message="second")
        self._post(message="third")
        data = self.client.get(self._url()).data
        self.assertEqual([m["message"] for m in data["messages"]], ["first", "second", "third"])

    def test_message_or_attachment_required(self):
        resp = self.client.post(self._url(), {"message": "   "}, format="multipart")
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(QueryMessage.objects.exists())

    # -- 5-image cap (atomic) ----------------------------------------------
    def test_six_attachments_rejected_400_zero_rows(self):
        files = [_png(f"img{i}.png") for i in range(6)]
        resp = self._post(files=files)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("attachments", resp.data)
        self.assertFalse(QueryMessage.objects.exists())
        self.assertFalse(QueryAttachment.objects.exists())
        self.assertFalse(Query.objects.exists())

    def test_five_attachments_allowed(self):
        files = [_png(f"img{i}.png") for i in range(5)]
        resp = self._post(files=files)
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(len(resp.data["attachments"]), 5)

    # -- type + size rejection (atomic) ------------------------------------
    def test_non_image_type_rejected_400_zero_rows(self):
        bad = SimpleUploadedFile("virus.exe", b"MZ...", content_type="application/x-msdownload")
        resp = self._post(files=[_png("ok.png"), bad])
        self.assertEqual(resp.status_code, 400)
        self.assertIn("attachments", resp.data)
        self.assertFalse(QueryMessage.objects.exists())
        self.assertFalse(QueryAttachment.objects.exists())

    def test_oversized_attachment_rejected_400_zero_rows(self):
        big = _png("huge.png", size=5 * 1024 * 1024 + 1)
        resp = self._post(files=[big])
        self.assertEqual(resp.status_code, 400)
        self.assertIn("attachments", resp.data)
        self.assertFalse(QueryMessage.objects.exists())
        self.assertFalse(QueryAttachment.objects.exists())

    # -- append-only audit trail -------------------------------------------
    def test_put_patch_delete_return_405_and_preserve_rows(self):
        self._post(message="immutable")
        self.assertEqual(QueryMessage.objects.count(), 1)
        for method in (self.client.put, self.client.patch, self.client.delete):
            resp = method(self._url())
            self.assertEqual(resp.status_code, 405)
        self.assertEqual(QueryMessage.objects.count(), 1)  # nothing removed

    # -- multi-doctor thread isolation -------------------------------------
    def test_other_doctors_pet_thread_404_on_get_and_post(self):
        other_pet = make_pet(make_doctor("drother"), name="NotYours")
        self.assertEqual(self.client.get(self._url(other_pet)).status_code, 404)
        resp = self._post(message="sneaky", files=[_png()], pet=other_pet)
        self.assertEqual(resp.status_code, 404)
        self.assertFalse(QueryMessage.objects.exists())
        self.assertFalse(QueryAttachment.objects.exists())


@override_settings(MEDIA_ROOT=_MEDIA)
class QueryInboxTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.client = APIClient()
        self.doc = make_doctor("drinbox")
        self.client.login(username="drinbox", password=PASSWORD)

    def _seed(self, pet, role, message, when):
        query, _ = Query.objects.get_or_create(pet=pet)
        msg = QueryMessage.objects.create(
            query=query,
            sender=self.doc if role == QueryMessage.DOCTOR else None,
            sender_role=role,
            message=message,
        )
        # sent_at is auto_now_add; override for deterministic ordering.
        QueryMessage.objects.filter(id=msg.id).update(sent_at=when)
        query.last_message_at = when
        query.save(update_fields=["last_message_at"])
        return msg

    def test_inbox_orders_desc_and_flags_awaiting_reply(self):
        now = timezone.now()
        pet_a = make_pet(self.doc, name="Alpha")
        pet_b = make_pet(self.doc, name="Bravo")
        # Alpha: older, last message from DOCTOR -> not awaiting.
        self._seed(pet_a, QueryMessage.DOCTOR, "vet replied", now - timezone.timedelta(hours=2))
        # Bravo: newer, last message from OWNER -> awaiting reply.
        self._seed(pet_b, QueryMessage.OWNER, "owner asked something long " * 5,
                   now - timezone.timedelta(minutes=5))

        resp = self.client.get("/api/v1/queries/inbox")
        self.assertEqual(resp.status_code, 200)
        results = resp.data["results"]
        self.assertEqual([r["pet"]["name"] for r in results], ["Bravo", "Alpha"])  # desc
        bravo, alpha = results
        self.assertTrue(bravo["awaiting_reply"])
        self.assertFalse(alpha["awaiting_reply"])
        self.assertEqual(bravo["last_message"]["sender_role"], "OWNER")
        self.assertLessEqual(len(bravo["last_message"]["snippet"]), 80)
        self.assertEqual(alpha["message_count"], 1)

    def test_inbox_excludes_other_doctors_threads(self):
        mine = make_pet(self.doc, name="Mine")
        self._seed(mine, QueryMessage.DOCTOR, "hello", timezone.now())
        # Another doctor's pet with a thread must not leak.
        other = make_pet(make_doctor("drx"), name="Theirs")
        q, _ = Query.objects.get_or_create(pet=other)
        QueryMessage.objects.create(query=q, sender_role=QueryMessage.OWNER, message="hi")
        q.last_message_at = timezone.now()
        q.save(update_fields=["last_message_at"])

        results = self.client.get("/api/v1/queries/inbox").data["results"]
        self.assertEqual([r["pet"]["name"] for r in results], ["Mine"])
