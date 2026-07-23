"""Channel dispatcher — resolves providers, enforces opt-out, writes audit logs.

Responsibilities (SRS §3.7, §7):
  * Resolve the concrete provider per channel from ``settings.NOTIFY_*_PROVIDER``
    via ``import_string``, with a fail-safe fallback to the dev mock (and a hard
    short-circuit to mock whenever ``settings.NOTIFY_MOCK`` is truthy — mirrors
    ``razorpay_client.get_client``).
  * Enforce the SMS opt-out centrally: if ``NotificationPref(owner_phone)`` is
    opted out, write a DeliveryLog ``SKIPPED_OPTED_OUT`` row instead of sending.
  * Write exactly one DeliveryLog row for EVERY attempt (mock, real, skip, or
    failure) so the §7 audit trail is complete.

SHARED foundation module: fan-out tasks import it read-only.
"""

import logging

from django.conf import settings
from django.utils.module_loading import import_string

from .mock import MockFcmProvider, MockSmsProvider

logger = logging.getLogger(__name__)


def _resolve(setting_path, fallback_cls):
    """Instantiate the provider at ``setting_path``; fall back to mock on error.

    A missing/broken dotted path must never break notification delivery, so any
    import/instantiation failure logs and falls back to the mock (fail-safe).
    """
    if getattr(settings, "NOTIFY_MOCK", True):
        return fallback_cls()
    try:
        return import_string(setting_path)()
    except Exception:
        logger.warning(
            "notify: could not load provider %r; falling back to %s",
            setting_path,
            fallback_cls.__name__,
        )
        return fallback_cls()


def _sms_provider():
    return _resolve(getattr(settings, "NOTIFY_SMS_PROVIDER", ""), MockSmsProvider)


def _fcm_provider():
    return _resolve(getattr(settings, "NOTIFY_FCM_PROVIDER", ""), MockFcmProvider)


def _log(notif, channel, recipient, status, detail=""):
    from ..models import DeliveryLog

    return DeliveryLog.objects.create(
        notification=notif,
        channel=channel,
        recipient=str(recipient),
        notif_type=getattr(notif, "type", "") or "",
        status=status,
        detail=detail or "",
    )


def _dispatch_sms(notif, sms_to, body):
    from ..models import DeliveryLog, NotificationPref

    pref = NotificationPref.objects.filter(owner_phone=sms_to).first()
    if pref is not None and pref.sms_opt_out:
        _log(
            notif,
            DeliveryLog.SMS,
            sms_to,
            DeliveryLog.SKIPPED_OPTED_OUT,
            "owner opted out of SMS",
        )
        return

    provider = _sms_provider()
    try:
        result = provider.send(sms_to, body, notif)
        _log(notif, DeliveryLog.SMS, sms_to, result.status, result.detail)
    except Exception as exc:  # a provider that raises must still be audited
        logger.exception("notify: SMS provider raised for %s", sms_to)
        _log(notif, DeliveryLog.SMS, sms_to, DeliveryLog.FAILED, str(exc))


def _dispatch_fcm(notif):
    from ..models import DeliveryLog

    tokens = []
    if getattr(notif, "user_id", None):
        tokens = list(notif.user.device_tokens.values_list("token", flat=True))
    # Even with no registered token we record one attempt (keyed by doctor id)
    # so every dispatch is auditable and the dev mock is observable offline.
    recipients = tokens or [f"user:{notif.user_id}"]

    provider = _fcm_provider()
    for recipient in recipients:
        try:
            result = provider.send(recipient, notif.message, notif)
            _log(notif, DeliveryLog.FCM, recipient, result.status, result.detail)
        except Exception as exc:
            logger.exception("notify: FCM provider raised for %s", recipient)
            _log(notif, DeliveryLog.FCM, recipient, DeliveryLog.FAILED, str(exc))


def dispatch(notif, *, sms_to=None, sms_body=None, push=True):
    """Fan a notification out across its channels, auditing every attempt.

    * ``sms_to`` — owner phone; when set, attempt an SMS (subject to opt-out).
    * ``push``   — when true, attempt an FCM web-push to the doctor's browser.
    """
    if sms_to:
        _dispatch_sms(notif, sms_to, sms_body or notif.message)
    if push:
        _dispatch_fcm(notif)
