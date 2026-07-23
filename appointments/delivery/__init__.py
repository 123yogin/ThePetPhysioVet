"""Delivery-channel abstraction for notifications (SRS §3.7, §7).

Both SMS (to the owner) and FCM web-push (to the doctor) sit behind the
:class:`~appointments.delivery.base.Channel` ABC. The concrete provider per
channel is resolved at dispatch time from ``settings.NOTIFY_*_PROVIDER`` with a
fail-safe fallback to the in-process dev mock (see ``mock.py``) so the whole
notification path is testable offline with no real keys and no network.

SHARED foundation package: fan-out tasks import it read-only.
"""

from .base import Channel, DeliveryResult
from .dispatch import dispatch

__all__ = ["Channel", "DeliveryResult", "dispatch"]
