"""FCM web-push delivery channel for the doctor's browser (SRS §3.7, §7).

``FcmProvider`` is the concrete :class:`~appointments.delivery.base.Channel` that
the dispatcher resolves from ``settings.NOTIFY_FCM_PROVIDER`` when real delivery
is enabled (``settings.NOTIFY_MOCK`` falsy). It targets the FCM registration
token(s) a doctor's browser registered via ``POST /api/v1/devices``.

Fail-safe design (mirrors the dev-mock precedent):
  * A real web-push needs a Firebase **service account** (``FCM_PROJECT_ID`` +
    ``FCM_SERVER_KEY``). When those creds are absent — the dev/CI default, since
    CLAUDE.md rule 1 forbids committing secrets — this provider delegates to the
    foundation :class:`~appointments.delivery.mock.MockFcmProvider`: it records a
    ``MOCK`` result and makes **zero external calls**, so the whole path stays
    testable offline.
  * ``send`` NEVER raises for an ordinary failure (per the ``Channel`` contract);
    a real-send error is caught and reported as ``FAILED`` so the dispatcher can
    still write its audit row.

The ``firebase-admin`` SDK is intentionally NOT a committed dependency and is
imported lazily, only when service-account creds are actually configured, so the
mock/offline path never touches it.
"""

from django.conf import settings

from .base import Channel, DeliveryResult
from .mock import MockFcmProvider


class FcmProvider(Channel):
    """Real FCM web-push channel with a fail-safe fallback to the dev mock."""

    name = "FCM"

    def __init__(self):
        self.project_id = getattr(settings, "FCM_PROJECT_ID", "") or ""
        self.server_key = getattr(settings, "FCM_SERVER_KEY", "") or ""
        # The mock is the fail-safe used whenever creds are missing.
        self._mock = MockFcmProvider()

    @property
    def is_configured(self) -> bool:
        """True only when a full Firebase service account is available."""
        return bool(self.project_id and self.server_key)

    def send(self, recipient, message, notif) -> DeliveryResult:
        from ..models import DeliveryLog

        # No service-account creds -> fail-safe to the mock (records MOCK, makes
        # no network call). This is the dev/CI default.
        if not self.is_configured:
            return self._mock.send(recipient, message, notif)

        try:
            return self._send_push(recipient, message, notif)
        except Exception as exc:  # never raise for an ordinary send failure
            return DeliveryResult(
                status=DeliveryLog.FAILED,
                detail=f"fcm error: {exc}",
            )

    def _send_push(self, recipient, message, notif) -> DeliveryResult:
        """Deliver a real web-push via ``firebase-admin`` to ``recipient`` token.

        Reached only when ``is_configured`` — i.e. a real deployment supplied a
        service account. The SDK is imported here (never at module load) so the
        offline mock path has no dependency on it.
        """
        from ..models import DeliveryLog

        # Deferred import: firebase-admin is an optional, deployment-only
        # dependency. A missing SDK is an ordinary failure, not a crash — it is
        # caught by ``send`` and audited as FAILED.
        import firebase_admin  # noqa: F401
        from firebase_admin import messaging

        msg = messaging.Message(
            token=recipient,
            notification=messaging.Notification(
                title="Pet Physio Vet",
                body=message or "",
            ),
        )
        ref = messaging.send(msg)
        return DeliveryResult(status=DeliveryLog.SENT, detail=f"fcm ref {ref}")
