"""Notification feed endpoints (SRS §3.7, §7) — the dashboard feed + badge.

US-NOTIF-01. These view bodies implement the doctor's notification feed on top
of the shared foundation plumbing (the ``Notification`` model + the frozen
route -> view-class contract in ``api_urls.py`` + ``NotificationSerializer``).

AuthZ in depth (CLAUDE.md rule 4): every queryset is scoped to
``request.user`` — a doctor only ever sees, marks, or counts their OWN
notifications. A cross-user primary key 404s and never mutates another
doctor's row.
"""

from rest_framework import status
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from rest_framework.permissions import IsAuthenticated
from ..models import Notification
from ..serializers.notifications import NotificationSerializer

# Default page size for the feed when ``?limit`` is absent/invalid, plus a hard
# ceiling so a caller cannot ask for an unbounded slice.
DEFAULT_LIMIT = 20
MAX_LIMIT = 100


def _owned(request):
    """The caller's own notifications, newest first (backed by the feed index)."""
    return Notification.objects.filter(user=request.user).order_by("-created_at", "-id")


def _unread_count(request):
    return Notification.objects.filter(user=request.user, is_read=False).count()


def _parse_limit(request):
    """Resolve ``?limit`` -> int in [1, MAX_LIMIT], falling back to the default."""
    raw = request.query_params.get("limit")
    if raw is None:
        return DEFAULT_LIMIT
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_LIMIT
    if value < 1:
        return DEFAULT_LIMIT
    return min(value, MAX_LIMIT)


class NotificationListView(APIView):
    """Latest-N notification feed for the dashboard, plus unread count."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        limit = _parse_limit(request)
        qs = _owned(request)[:limit]
        return Response(
            {
                # Client contract key is ``results`` (NotificationFeed in
                # clients/web/src/lib/types.ts). Must stay ``results`` — the
                # dashboard feed iterates ``data.results``.
                "results": NotificationSerializer(qs, many=True).data,
                "unread_count": _unread_count(request),
            }
        )


class NotificationUnreadCountView(APIView):
    """Unread badge count for the app shell."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"unread_count": _unread_count(request)})


class NotificationMarkReadView(APIView):
    """Mark a single owned notification as read (idempotent)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        # Scope by user so a cross-user pk 404s and never mutates another
        # doctor's row (AC-06).
        notification = get_object_or_404(Notification, pk=pk, user=request.user)
        if not notification.is_read:
            notification.is_read = True
            notification.save(update_fields=["is_read"])
        return Response({"unread_count": _unread_count(request)})


class NotificationMarkAllReadView(APIView):
    """Mark all of the doctor's notifications as read."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
        return Response({"unread_count": _unread_count(request)})
