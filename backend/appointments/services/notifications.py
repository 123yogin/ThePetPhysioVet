"""Notification service (SRS §3.7, §7).

``notify(...)`` is the single entry point every event receiver and the reminder
command call to raise a notification. It:

  * creates the in-app :class:`~appointments.models.Notification` idempotently on
    ``dedup_key`` (``get_or_create``; a NULL key always creates a fresh row), and
  * fans it out over the delivery channels (SMS to the owner, FCM to the doctor).

The entire body is wrapped in a ``try/except`` that logs and swallows: a
notification/delivery failure must NEVER propagate into — or roll back — the
caller's business transaction (AC-03). Delivery itself writes a DeliveryLog for
every attempt (see ``delivery/dispatch.py``).

SHARED foundation module: fan-out tasks import it read-only.
"""

import logging

from ..delivery import dispatch as dispatch_delivery
from ..models import Notification

logger = logging.getLogger(__name__)


def notify(user, type, message, dedup_key=None, sms_to=None, sms_body=None, push=True):
    """Create (idempotently) and deliver a notification.

    Returns the ``Notification`` (existing or new), or ``None`` if anything
    failed — callers must treat a notification as best-effort.

    * ``dedup_key`` — idempotency key. When set, a repeat call returns the
      existing row and does NOT re-deliver. When ``None``, always creates.
    * ``sms_to`` / ``sms_body`` — owner phone + optional distinct SMS text.
    * ``push`` — attempt an FCM web-push to ``user`` (the doctor).
    """
    try:
        if dedup_key:
            notif, created = Notification.objects.get_or_create(
                dedup_key=dedup_key,
                defaults={"user": user, "type": type, "message": message},
            )
        else:
            notif = Notification.objects.create(user=user, type=type, message=message)
            created = True

        # Idempotency: only deliver on first creation. A repeated dedup_key
        # returns the existing row untouched and does not re-send.
        if created:
            dispatch_delivery(notif, sms_to=sms_to, sms_body=sms_body, push=push)
        return notif
    except Exception:
        logger.exception(
            "notify: failed (user=%s type=%s dedup_key=%s)",
            getattr(user, "pk", None),
            type,
            dedup_key,
        )
        return None
