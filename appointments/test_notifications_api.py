"""Tests for the notification feed API (SRS §3.7, §7, US-NOTIF-01).

Run with:  ./.venv/bin/python manage.py test appointments.test_notifications_api

Covers: newest-first ordering, the latest-N ``?limit`` slice (default + cap),
unread-count accuracy, mark-one idempotency, mark-all, and cross-user denial
with no mutation (AC-06). Every queryset is scoped to ``request.user`` — a
doctor sees / marks / counts only their own notifications.

The views live in ``api_notifications.py`` and are dispatched directly via
``APIRequestFactory`` (mirroring the sibling billing tests), which exercises the
real permission + queryset-scoping paths.
"""

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from .api_notifications import (
    DEFAULT_LIMIT,
    MAX_LIMIT,
    NotificationListView,
    NotificationMarkAllReadView,
    NotificationMarkReadView,
    NotificationUnreadCountView,
)
from .models import Notification
from .tests import PASSWORD, make_doctor


def make_notification(user, message="hi", ntype=Notification.APPOINTMENT_CREATED, is_read=False):
    return Notification.objects.create(user=user, type=ntype, message=message, is_read=is_read)


class NotificationFeedTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.doc = make_doctor("drfeed")
        self.other = make_doctor("drother")

    # -- helpers ---------------------------------------------------------
    def _list(self, user, query=""):
        request = self.factory.get("/api/v1/notifications" + query)
        force_authenticate(request, user=user)
        return NotificationListView.as_view()(request)

    def _count(self, user):
        request = self.factory.get("/api/v1/notifications/unread-count")
        force_authenticate(request, user=user)
        return NotificationUnreadCountView.as_view()(request)

    def _mark(self, user, pk):
        request = self.factory.post(f"/api/v1/notifications/{pk}/read")
        force_authenticate(request, user=user)
        return NotificationMarkReadView.as_view()(request, pk=pk)

    def _mark_all(self, user):
        request = self.factory.post("/api/v1/notifications/mark-all-read")
        force_authenticate(request, user=user)
        return NotificationMarkAllReadView.as_view()(request)

    # -- ordering --------------------------------------------------------
    def test_feed_is_newest_first(self):
        first = make_notification(self.doc, message="oldest")
        second = make_notification(self.doc, message="middle")
        third = make_notification(self.doc, message="newest")
        resp = self._list(self.doc)
        self.assertEqual(resp.status_code, 200, resp.data)
        ids = [row["id"] for row in resp.data["results"]]
        self.assertEqual(ids, [third.id, second.id, first.id])

    # -- latest-N limit --------------------------------------------------
    def test_default_limit_returns_20(self):
        for i in range(25):
            make_notification(self.doc, message=f"n{i}")
        resp = self._list(self.doc)
        self.assertEqual(len(resp.data["results"]), DEFAULT_LIMIT)
        # The 20 returned are the newest 20 (highest ids).
        newest = list(
            Notification.objects.filter(user=self.doc)
            .order_by("-created_at", "-id")
            .values_list("id", flat=True)[:DEFAULT_LIMIT]
        )
        self.assertEqual([row["id"] for row in resp.data["results"]], newest)

    def test_explicit_limit_is_respected(self):
        for i in range(10):
            make_notification(self.doc, message=f"n{i}")
        resp = self._list(self.doc, "?limit=3")
        self.assertEqual(len(resp.data["results"]), 3)

    def test_limit_is_capped_at_max(self):
        for i in range(3):
            make_notification(self.doc, message=f"n{i}")
        # A huge limit is clamped to MAX_LIMIT; it never errors and returns all.
        resp = self._list(self.doc, f"?limit={MAX_LIMIT + 500}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["results"]), 3)

    def test_invalid_limit_falls_back_to_default(self):
        for i in range(3):
            make_notification(self.doc, message=f"n{i}")
        for bad in ("?limit=abc", "?limit=0", "?limit=-5", "?limit="):
            resp = self._list(self.doc, bad)
            self.assertEqual(resp.status_code, 200, bad)
            self.assertEqual(len(resp.data["results"]), 3, bad)

    # -- unread count ----------------------------------------------------
    def test_unread_count_accuracy(self):
        make_notification(self.doc, is_read=False)
        make_notification(self.doc, is_read=False)
        make_notification(self.doc, is_read=True)
        make_notification(self.other, is_read=False)  # not counted for doc
        resp = self._count(self.doc)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["unread_count"], 2)

    def test_list_includes_unread_count(self):
        make_notification(self.doc, is_read=False)
        make_notification(self.doc, is_read=True)
        resp = self._list(self.doc)
        self.assertEqual(resp.data["unread_count"], 1)

    def test_feed_scoped_to_owner(self):
        make_notification(self.doc, message="mine")
        make_notification(self.other, message="theirs")
        resp = self._list(self.doc)
        messages = [row["message"] for row in resp.data["results"]]
        self.assertEqual(messages, ["mine"])

    # -- mark one --------------------------------------------------------
    def test_mark_one_read_and_returns_count(self):
        n1 = make_notification(self.doc, is_read=False)
        make_notification(self.doc, is_read=False)
        resp = self._mark(self.doc, n1.id)
        self.assertEqual(resp.status_code, 200)
        n1.refresh_from_db()
        self.assertTrue(n1.is_read)
        self.assertEqual(resp.data["unread_count"], 1)

    def test_mark_one_is_idempotent(self):
        n1 = make_notification(self.doc, is_read=False)
        first = self._mark(self.doc, n1.id)
        second = self._mark(self.doc, n1.id)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        n1.refresh_from_db()
        self.assertTrue(n1.is_read)  # repeat keeps it read
        self.assertEqual(second.data["unread_count"], 0)

    # -- mark all --------------------------------------------------------
    def test_mark_all_read(self):
        make_notification(self.doc, is_read=False)
        make_notification(self.doc, is_read=False)
        make_notification(self.doc, is_read=True)
        resp = self._mark_all(self.doc)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["unread_count"], 0)
        self.assertFalse(Notification.objects.filter(user=self.doc, is_read=False).exists())

    def test_mark_all_does_not_touch_other_doctor(self):
        make_notification(self.doc, is_read=False)
        their = make_notification(self.other, is_read=False)
        self._mark_all(self.doc)
        their.refresh_from_db()
        self.assertFalse(their.is_read)  # other doctor's unread survives

    # -- cross-user denial (AC-06) ---------------------------------------
    def test_mark_cross_user_404s_and_does_not_mutate(self):
        theirs = make_notification(self.other, is_read=False)
        resp = self._mark(self.doc, theirs.id)
        self.assertEqual(resp.status_code, 404)
        theirs.refresh_from_db()
        self.assertFalse(theirs.is_read)  # untouched

    def test_mark_missing_pk_404s(self):
        resp = self._mark(self.doc, 999999)
        self.assertEqual(resp.status_code, 404)

    # -- permission ------------------------------------------------------
    def test_non_vet_is_forbidden(self):
        plain = User.objects.create_user(username="notavet", password=PASSWORD)
        make_notification(self.doc)  # exists but caller has no profile
        resp = self._list(plain)
        self.assertEqual(resp.status_code, 403)

    def test_unauthenticated_is_forbidden(self):
        request = self.factory.get("/api/v1/notifications")
        resp = NotificationListView.as_view()(request)
        self.assertIn(resp.status_code, (401, 403))
