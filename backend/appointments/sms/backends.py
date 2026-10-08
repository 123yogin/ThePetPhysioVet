"""SMS providers. Each backend turns (to, body, message_id) into a SendResult
and never raises; send_sms() owns idempotency, opt-out, the daily cap and the
database row, so a new provider only has to implement `send`.

Swapping provider (e.g. to a DLT-registered Indian aggregator): add a class
with `name` and `send(to_e164, body, message_id, timeout)`, register it in
BACKENDS, and allow its name in settings.SMS_BACKENDS.

android_gateway is capcom6 "SMS Gateway for Android" (Apache-2.0) in Cloud
mode. Request/response shapes were taken from the Cloud server's Swagger
(https://api.sms-gate.app/docs/doc.json, read 2026-10-08):

    POST {SMS_GATEWAY_URL}/messages   HTTP Basic auth
      {"id": <=36 chars, "textMessage": {"text": ...}, "phoneNumbers": [...],
       "withDeliveryReport": true, "ttl": seconds}
    202 -> smsgateway.GetMessageResponse {id, state, recipients, deviceId}
    409 -> a message with this id already exists (we treat as accepted)
    503 -> queue limits exceeded / device offline
"""
import base64
import http.client
import json
import logging
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

from django.conf import settings
from rest_framework import serializers

logger = logging.getLogger("appointments.sms")

# A confirmation that arrives days late (phone off, no signal) is worse than
# none -- the gateway drops it after this many seconds.
GATEWAY_TTL_SECONDS = 24 * 60 * 60

_GATEWAY_STATES = ("Pending", "Cancelling", "Cancelled", "Processed", "Sent", "Delivered", "Failed")


@dataclass
class SendResult:
    ok: bool
    provider_id: str = ""
    error: str = ""
    # True when the request may have reached the provider but no answer came
    # back (timeout, dropped connection): it might have been sent, so it counts
    # toward the daily cap and is safe to retry only because the id is reused.
    uncertain: bool = False


class _NoRedirect(HTTPRedirectHandler):
    """Never follow a redirect: it would replay the Basic-auth header and the
    patient's number to wherever the Location points (security review L1).
    Returning None makes urllib raise HTTPError with the 3xx status."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_OPENER = build_opener(_NoRedirect())


def urlopen(req, timeout):
    """The only network call in this package (patched in tests)."""
    return _OPENER.open(req, timeout=timeout)


def _transport_failure(exc):
    """(error text, uncertain) for an exception raised before any HTTP status."""
    reason = exc.reason if isinstance(exc, URLError) else exc
    if isinstance(reason, (TimeoutError, ConnectionResetError, ConnectionAbortedError,
                           http.client.RemoteDisconnected, http.client.IncompleteRead)):
        uncertain = True
    elif isinstance(exc, URLError) or isinstance(reason, ConnectionRefusedError):
        uncertain = False   # DNS, refused, TLS: the request never left
    else:
        uncertain = True    # unknown socket error: assume it may have gone out
    return f"Gateway unreachable: {type(reason).__name__}: {reason}"[:300], uncertain


class _GatewayAccepted(serializers.Serializer):
    """The parts of the 202 body we rely on (schema-validated, not trusted)."""
    id = serializers.CharField(max_length=64)
    state = serializers.ChoiceField(choices=_GATEWAY_STATES)


class ConsoleBackend:
    name = "console"

    def send(self, to, body, message_id, timeout):
        # Phone masked even here: logs are shipped off-box on Vercel.
        from .service import mask_phone
        logger.info("[console SMS] to=%s id=%s body=%r", mask_phone(to), message_id, body)
        return SendResult(ok=True, provider_id=f"console-{message_id}")


class AndroidGatewayBackend:
    name = "android_gateway"

    def _auth_header(self):
        raw = f"{settings.SMS_GATEWAY_USERNAME}:{settings.SMS_GATEWAY_PASSWORD}".encode()
        return "Basic " + base64.b64encode(raw).decode()

    def send(self, to, body, message_id, timeout):
        payload = {
            "id": message_id,
            "textMessage": {"text": body},
            "phoneNumbers": [to],
            "withDeliveryReport": True,
            "ttl": GATEWAY_TTL_SECONDS,
        }
        req = Request(
            settings.SMS_GATEWAY_URL.rstrip("/") + "/messages",
            data=json.dumps(payload).encode(),
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": self._auth_header(),
            },
        )
        try:
            with urlopen(req, timeout=timeout) as resp:
                raw = resp.read()
        except HTTPError as exc:
            if exc.code == 409:
                # Our id is the row id, so this is a retry of a message the
                # gateway already queued: it is sent, do not send it again.
                return SendResult(ok=True, provider_id=message_id)
            return SendResult(ok=False, error=self._http_error(exc))
        except (OSError, http.client.HTTPException) as exc:  # URLError/TimeoutError are OSErrors
            error, uncertain = _transport_failure(exc)
            return SendResult(ok=False, error=error, uncertain=uncertain)

        try:
            data = json.loads(raw or b"{}")
        except ValueError:
            data = None
        check = _GatewayAccepted(data=data if isinstance(data, dict) else {})
        if not check.is_valid():
            return SendResult(ok=False, error="Unexpected gateway response (no id/state).")
        if check.validated_data["state"] in ("Failed", "Cancelled"):
            return SendResult(ok=False, provider_id=check.validated_data["id"],
                              error=f"Gateway reported {check.validated_data['state']}.")
        return SendResult(ok=True, provider_id=check.validated_data["id"])

    @staticmethod
    def _http_error(exc):
        message = ""
        try:
            data = json.loads(exc.read() or b"{}")
            if isinstance(data, dict):
                message = str(data.get("message") or "")[:200]
        except Exception:  # noqa: BLE001 -- the body is best-effort context only
            pass
        hint = {
            401: "check SMS_GATEWAY_USERNAME/PASSWORD",
            403: "check SMS_GATEWAY_USERNAME/PASSWORD",
            503: "phone offline or gateway queue full",
        }.get(exc.code, "")
        parts = [f"Gateway HTTP {exc.code}"]
        if message:
            parts.append(message)
        if hint:
            parts.append(hint)
        return ": ".join(parts)


BACKENDS = {
    ConsoleBackend.name: ConsoleBackend,
    AndroidGatewayBackend.name: AndroidGatewayBackend,
}


def get_backend(name):
    """The backend instance for `name`, or None for "disabled"/unknown."""
    cls = BACKENDS.get(name)
    return cls() if cls else None
