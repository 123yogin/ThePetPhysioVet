"""Real SMS channel adapters (Twilio / MSG91) — SRS §3.7, §7.

Concrete :class:`~appointments.delivery.base.Channel` implementations that send a
real SMS to the pet owner's phone. They are selected purely by the dotted path in
``settings.NOTIFY_SMS_PROVIDER`` (e.g. ``appointments.delivery.sms.TwilioSmsProvider``)
which the dispatcher resolves via ``import_string`` — the class IS the selection
mechanism, so no extra "which backend" setting is needed.

Two rules from CLAUDE.md / the task shape how these behave:

  * **Secrets from env only, never committed.** Credentials are read from
    ``settings`` (which sources them from env with EMPTY defaults). A provider
    that is missing a required credential raises in ``__init__`` — so when creds
    are absent (or ``NOTIFY_MOCK`` is truthy) the dispatcher's fail-safe
    ``_resolve`` never gets a working instance and falls back to the foundation
    :class:`~appointments.delivery.mock.MockSmsProvider`. The real provider is
    thus *never even instantiated* offline / in CI.
  * **Never raise for an ordinary delivery failure** (base.Channel contract):
    :meth:`SmsProvider.send` catches everything and returns a
    ``DeliveryResult(status=FAILED, detail=...)`` so the dispatcher can always
    write its one audit row. The vendor SDK / HTTP client is imported lazily
    inside the send so mock/CI paths never require it installed and no network
    call is made unless a real send actually runs.
"""

import logging

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

from .base import Channel, DeliveryResult

logger = logging.getLogger(__name__)


class SmsProvider(Channel):
    """Base for the concrete Twilio / MSG91 SMS adapters.

    Subclasses declare the ``settings`` attributes they require in
    ``REQUIRED_SETTINGS`` and implement :meth:`_send` (the actual vendor call,
    returning a provider reference string). This base enforces the credential
    check on construction and the "never raise on failure" send contract.
    """

    name = "SMS"
    #: settings attribute names that must be non-empty for this provider to work.
    REQUIRED_SETTINGS: tuple = ()

    def __init__(self):
        missing = [
            key for key in self.REQUIRED_SETTINGS if not getattr(settings, key, "")
        ]
        if missing:
            # Raising here is intentional: the dispatcher's fail-safe resolver
            # catches it and falls back to the mock, so an unconfigured real
            # provider degrades to a recorded MOCK delivery rather than blowing
            # up the notification path.
            raise ImproperlyConfigured(
                f"{type(self).__name__} missing required settings: "
                f"{', '.join(missing)}"
            )

    def send(self, recipient, message, notif) -> DeliveryResult:
        from ..models import DeliveryLog

        if not recipient:
            return DeliveryResult(status=DeliveryLog.FAILED, detail="no recipient phone")
        try:
            ref = self._send(str(recipient), message or "")
            return DeliveryResult(status=DeliveryLog.SENT, detail=ref or "")
        except Exception as exc:  # ordinary delivery failure -> audited, not raised
            logger.warning(
                "SMS send failed via %s to %s: %s",
                type(self).__name__,
                recipient,
                exc,
            )
            return DeliveryResult(
                status=DeliveryLog.FAILED,
                detail=f"{type(exc).__name__}: {exc}",
            )

    def _send(self, recipient, message) -> str:
        """Perform the vendor send; return a provider reference. May raise."""
        raise NotImplementedError


class TwilioSmsProvider(SmsProvider):
    """Sends SMS via Twilio's REST API.

    Needs ``TWILIO_ACCOUNT_SID``, ``TWILIO_AUTH_TOKEN`` and ``TWILIO_FROM_NUMBER``
    (all env-sourced). The ``twilio`` SDK is imported lazily so it is never a
    hard dependency of the mock/CI path.
    """

    REQUIRED_SETTINGS = (
        "TWILIO_ACCOUNT_SID",
        "TWILIO_AUTH_TOKEN",
        "TWILIO_FROM_NUMBER",
    )

    def _send(self, recipient, message) -> str:
        from twilio.rest import Client  # lazy: not needed offline / in CI

        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        msg = client.messages.create(
            to=recipient,
            from_=settings.TWILIO_FROM_NUMBER,
            body=message,
        )
        return f"twilio:{msg.sid}"


class Msg91SmsProvider(SmsProvider):
    """Sends SMS via MSG91's HTTP API.

    Needs ``MSG91_AUTH_KEY`` and ``MSG91_SENDER_ID`` (env-sourced). Uses the
    ``requests`` client lazily and returns MSG91's request id on success.
    """

    REQUIRED_SETTINGS = (
        "MSG91_AUTH_KEY",
        "MSG91_SENDER_ID",
    )
    ENDPOINT = "https://api.msg91.com/api/sendhttp.php"

    def _send(self, recipient, message) -> str:
        import requests  # lazy: no real call is made unless a real send runs

        resp = requests.post(
            self.ENDPOINT,
            data={
                "authkey": settings.MSG91_AUTH_KEY,
                "sender": settings.MSG91_SENDER_ID,
                # MSG91 expects the bare number (no leading '+').
                "mobiles": recipient.lstrip("+"),
                "message": message,
                "route": "4",
                "country": "91",
            },
            timeout=10,
        )
        resp.raise_for_status()
        return f"msg91:{(resp.text or '').strip()}"
