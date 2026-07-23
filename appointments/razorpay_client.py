"""Razorpay integration boundary (SRS §3.8).

A single, thin seam over the Razorpay SDK so the rest of the billing code never
imports ``razorpay`` directly. When ``settings.RAZORPAY_MOCK`` is truthy (the
dev/CI default) a deterministic in-process mock is used: it needs no network and
no real keys, and signature verification is a plain HMAC-SHA256 so tests can
compute a valid signature. We never store raw card data — only the gateway's
order/payment identifiers flow through here.

This is a SHARED foundation module: fan-out tasks import it read-only.
"""

import hashlib
import hmac
import json

from django.conf import settings


# ---------------------------------------------------------------------------
# Deterministic dev mock
# ---------------------------------------------------------------------------
class _MockClientUtility:
    """Mirrors ``razorpay.Client().utility`` for the bits we use."""

    def verify_webhook_signature(self, body, signature, secret):
        # Raises like the real SDK on mismatch; returns True on success.
        if not _hmac_matches(body, signature, secret):
            raise SignatureVerificationError("Mock webhook signature mismatch")
        return True


class _MockClient:
    """Deterministic stand-in for ``razorpay.Client``.

    ``order.create`` returns a stable, input-derived order id so tests and the
    web checkout stub behave predictably without any network call.
    """

    def __init__(self):
        self.utility = _MockClientUtility()
        self.order = self

    def create(self, data):  # razorpay Client.order.create(data)
        amount = int(data.get("amount", 0))
        receipt = str(data.get("receipt", ""))
        digest = hashlib.sha256(f"{receipt}:{amount}".encode()).hexdigest()[:14]
        return {
            "id": f"order_mock_{digest}",
            "entity": "order",
            "amount": amount,
            "amount_paid": 0,
            "amount_due": amount,
            "currency": data.get("currency", "INR"),
            "receipt": receipt,
            "status": "created",
            "notes": data.get("notes", {}),
        }


class SignatureVerificationError(Exception):
    """Raised when a webhook signature cannot be verified."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _webhook_secret():
    # In mock mode fall back to a fixed dev secret so signature checks work even
    # when no env var is set; real mode requires the configured secret.
    secret = settings.RAZORPAY_WEBHOOK_SECRET
    if not secret and settings.RAZORPAY_MOCK:
        return "mock-webhook-secret"
    return secret


def _hmac_matches(body, signature, secret):
    if isinstance(body, str):
        body = body.encode()
    if isinstance(secret, str):
        secret = secret.encode()
    expected = hmac.new(secret, body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature or "")


def sign_body(body, secret=None):
    """Return the HMAC-SHA256 hex signature for ``body`` — used by tests and by
    the mock checkout flow to produce a webhook signature the app will accept."""
    secret = secret if secret is not None else _webhook_secret()
    if isinstance(body, str):
        body = body.encode()
    if isinstance(secret, str):
        secret = secret.encode()
    return hmac.new(secret, body, hashlib.sha256).hexdigest()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def get_client():
    """Return a Razorpay client (or the deterministic mock in dev/CI)."""
    if settings.RAZORPAY_MOCK:
        return _MockClient()
    import razorpay  # imported lazily so mock/CI never needs the SDK installed

    return razorpay.Client(
        auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
    )


def create_order(invoice):
    """Create a gateway order for ``invoice`` and return the order dict.

    Amount is the invoice total in the smallest currency unit (paise).
    """
    amount_paise = int((invoice.total * 100).to_integral_value())
    client = get_client()
    return client.order.create(
        {
            "amount": amount_paise,
            "currency": "INR",
            "receipt": f"invoice_{invoice.pk}",
            "notes": {"invoice_no": str(invoice.invoice_no)},
        }
    )


def verify_webhook_signature(body, signature):
    """Verify a Razorpay webhook signature. Returns True or raises.

    ``body`` is the raw request body (bytes/str); ``signature`` is the value of
    the ``X-Razorpay-Signature`` header.
    """
    secret = _webhook_secret()
    if settings.RAZORPAY_MOCK:
        if not _hmac_matches(body, signature, secret):
            raise SignatureVerificationError("Webhook signature mismatch")
        return True

    client = get_client()
    try:
        client.utility.verify_webhook_signature(
            body.decode() if isinstance(body, (bytes, bytearray)) else body,
            signature,
            secret,
        )
    except Exception as exc:  # razorpay raises SignatureVerificationError
        raise SignatureVerificationError(str(exc)) from exc
    return True


def parse_webhook_body(body):
    """Best-effort JSON parse of a webhook body (bytes/str) -> dict."""
    if isinstance(body, (bytes, bytearray)):
        body = body.decode()
    return json.loads(body or "{}")
