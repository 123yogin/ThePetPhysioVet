"""In-process dev mock providers (SRS §3.7).

These send nothing externally and need no keys and no network — they simply
return a ``MOCK`` :class:`DeliveryResult`. They are the default provider for
both channels (``settings.NOTIFY_*_PROVIDER``) and the fail-safe fallback used
whenever ``settings.NOTIFY_MOCK`` is truthy (the dev/CI default) or a real
provider fails to load. Mirrors the ``razorpay_client`` mock precedent so the
notification path is fully testable offline; every attempt is still audited via
a DeliveryLog written by the dispatcher.

SHARED foundation module: fan-out tasks import it read-only.
"""

from .base import Channel, DeliveryResult


class MockSmsProvider(Channel):
    """Records a would-be SMS send without touching Twilio/MSG91."""

    name = "SMS"

    def send(self, recipient, message, notif) -> DeliveryResult:
        from ..models import DeliveryLog

        return DeliveryResult(
            status=DeliveryLog.MOCK,
            detail=f"mock-sms to {recipient}: {(message or '')[:80]}",
        )


class MockFcmProvider(Channel):
    """Records a would-be FCM web-push without touching FCM."""

    name = "FCM"

    def send(self, recipient, message, notif) -> DeliveryResult:
        from ..models import DeliveryLog

        return DeliveryResult(
            status=DeliveryLog.MOCK,
            detail=f"mock-fcm to {recipient}: {(message or '')[:80]}",
        )
