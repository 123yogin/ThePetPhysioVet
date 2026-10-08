"""Delivery-status webhooks from the Android gateway.

Signing (gateway docs, features/webhooks "Payload Signing", read 2026-10-08):
the device sends X-Signature = hex HMAC-SHA256(signing_key, raw_body +
X-Timestamp) and X-Timestamp = Unix seconds. We recompute over the raw bytes,
compare in constant time and refuse timestamps more than 5 minutes off
(replay). Events: sms:sent / sms:delivered / sms:failed / sms:cancelled, each
with payload.messageId = the id we sent (our SmsMessage.id).
"""
import hashlib
import hmac
import time

from rest_framework import serializers

from ..models import SmsMessage
from .service import scrub

MAX_SKEW_SECONDS = 300

# How far along a message is; a late or retried event never moves it back.
_RANK = {"QUEUED": 0, "SENT": 1, "FAILED": 2, "DELIVERED": 3}
_EVENT_STATUS = {
    "sms:sent": "SENT",
    "sms:delivered": "DELIVERED",
    "sms:failed": "FAILED",
    "sms:cancelled": "FAILED",
}


def signature_ok(key, raw_body, timestamp, signature, now=None):
    if not key or not timestamp or not signature:
        return False
    try:
        ts = int(timestamp)
    except (TypeError, ValueError):
        return False
    if abs((now or time.time()) - ts) > MAX_SKEW_SECONDS:
        return False
    expected = hmac.new(key.encode(), raw_body + str(timestamp).encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, str(signature).strip().lower())


class _Payload(serializers.Serializer):
    messageId = serializers.CharField(max_length=64)
    reason = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class WebhookEventSerializer(serializers.Serializer):
    event = serializers.CharField(max_length=40)
    payload = _Payload()


def apply_event(event, payload):
    """Update the matching row. Returns "updated", "ignored" or "unknown"."""
    new_status = _EVENT_STATUS.get(event)
    if new_status is None:
        return "ignored"
    msg = SmsMessage.objects.filter(provider_id=payload["messageId"]).first()
    if msg is None:
        return "unknown"
    if _RANK.get(new_status, 0) <= _RANK.get(msg.status, 0):
        return "ignored"
    fields = {"status": new_status}
    if new_status == "FAILED":
        reason = payload.get("reason") or ("Cancelled on the gateway." if event == "sms:cancelled" else "")
        fields["error"] = scrub(f"Gateway: {reason}")[:500]
    # Conditional update: two concurrent events cannot both win a downgrade.
    SmsMessage.objects.filter(pk=msg.pk, status=msg.status).update(**fields)
    return "updated"
