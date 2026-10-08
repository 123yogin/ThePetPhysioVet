"""send_sms(): the one door every transactional text goes through.

Order of checks (each one recorded on the SmsMessage row):
  1. idempotency -- a unique key per (kind, related object, scheduled date) is
     INSERTed first; a duplicate returns the existing row and sends nothing.
     FAILED / SKIPPED_LIMIT / SKIPPED_DISABLED rows the provider never accepted
     are retried in place (claimed with a conditional UPDATE).
  2. a usable number (E.164; Indian numbers fold to +91)        -> FAILED
  3. the owner's NotificationPref.sms_opt_out                    -> SKIPPED_OPTOUT
  4. SMS_BACKEND=disabled                                        -> SKIPPED_DISABLED
  5. the daily cap, counted from rows the provider accepted today -> SKIPPED_LIMIT
  6. the provider call, 5 s timeout                              -> SENT / FAILED

Hard rule, same as notify.py: this must NEVER break the request or cron run
that triggered it. Every failure is logged (phone masked, never credentials)
and returned as a FAILED row.
"""
import logging
import re
import uuid
from datetime import datetime, time, timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from ..models import Appointment, BoardingBooking, NotificationPref, SmsMessage
from ..validators import phone_key
from .backends import get_backend

logger = logging.getLogger("appointments.sms")

RETRYABLE = ("FAILED", "SKIPPED_LIMIT", "SKIPPED_DISABLED")

_SEPARATORS = re.compile(r"[\s\-.() ]")
_VALID = re.compile(r"^\+?\d{10,15}$")

# GSM 03.38 default alphabet; the extension table costs two septets each.
_GSM_BASIC = set(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?"
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
)
_GSM_EXTENDED = set("^{}\\[~]|€\f")


def gsm_length(body):
    """Septets `body` needs in GSM-7, or None if it needs UCS-2 (70/segment)."""
    n = 0
    for ch in body:
        if ch in _GSM_BASIC:
            n += 1
        elif ch in _GSM_EXTENDED:
            n += 2
        else:
            return None
    return n


def to_e164(raw):
    """E.164 for a number the clinic can text, else None. A number written
    without a country code is Indian (the clinic's patients are); one written
    with "+" keeps its own country code."""
    cleaned = _SEPARATORS.sub("", str(raw or "")).strip()
    if not _VALID.match(cleaned):
        return None
    digits = cleaned.lstrip("+")
    if cleaned.startswith("+"):
        return None if digits.startswith("0") else "+" + digits
    if (
        len(digits) == 10
        or (len(digits) == 12 and digits.startswith("91"))
        or (len(digits) == 11 and digits.startswith("0"))
        or (len(digits) == 14 and digits.startswith("0091"))
    ):
        return "+91" + phone_key(cleaned)
    return None


def mask_phone(value):
    s = str(value or "")
    if not s:
        return ""
    if len(s) <= 4:
        return "****"
    return "*" * (len(s) - 4) + s[-4:]


def sms_mode():
    return settings.SMS_BACKEND


def _today_bounds():
    start = timezone.make_aware(datetime.combine(timezone.localdate(), time.min))
    return start, start + timedelta(days=1)


def sent_today_count():
    """Texts the provider accepted today (clinic's local day). Counted by
    sent_at, so a later delivered/failed webhook does not free a slot."""
    start, end = _today_bounds()
    return SmsMessage.objects.filter(sent_at__gte=start, sent_at__lt=end).count()


def _opted_out(e164):
    variants = {e164, e164.lstrip("+")}
    if e164.startswith("+91") and len(e164) == 13:
        key = e164[3:]
        variants |= {key, "91" + key, "0" + key}
    return NotificationPref.objects.filter(owner_phone__in=variants, sms_opt_out=True).exists()


def _related_fields(related):
    if isinstance(related, Appointment):
        return "appointment", {"appointment": related}
    if isinstance(related, BoardingBooking):
        return "boarding", {"boarding": related}
    return None, {}


def _idempotency_key(kind, related, scheduled_for):
    label, _ = _related_fields(related)
    if label is None:
        return f"{kind}:{uuid.uuid4().hex}"
    return f"{kind}:{label}:{related.pk}:{scheduled_for or ''}"[:200]


def _finish(msg, status, *, error="", provider_id="", provider=""):
    msg.status = status
    msg.error = (error or "")[:500]
    if provider_id:
        msg.provider_id = provider_id[:64]
    if provider:
        msg.provider = provider
    fields = ["status", "error", "provider_id", "provider", "updated_at"]
    if status == "SENT":
        msg.sent_at = timezone.now()
        fields.append("sent_at")
    msg.save(update_fields=fields)
    log = logger.warning if status == "FAILED" else logger.info
    log("SMS %s kind=%s to=%s id=%s%s", status, msg.kind, mask_phone(msg.to), msg.id,
        f" error={msg.error}" if msg.error else "")
    return msg


def _claim(kind, body, e164, raw_to, related, scheduled_for, requested_by):
    """Insert the row (or claim a retryable one). Returns (msg, should_send)."""
    key = _idempotency_key(kind, related, scheduled_for)
    _, fks = _related_fields(related)
    to_value = (e164 or str(raw_to or ""))[:50]
    try:
        with transaction.atomic():
            msg = SmsMessage.objects.create(
                to=to_value, body=body, kind=kind, status="QUEUED",
                idempotency_key=key, requested_by=requested_by, **fks,
            )
        return msg, True
    except IntegrityError:
        msg = SmsMessage.objects.get(idempotency_key=key)
    if msg.status not in RETRYABLE or msg.sent_at is not None:
        return msg, False
    claimed = SmsMessage.objects.filter(pk=msg.pk, status=msg.status, sent_at__isnull=True).update(
        status="QUEUED", error="", body=body, to=to_value, updated_at=timezone.now(),
    )
    msg.refresh_from_db()
    return msg, bool(claimed)


def _send(to, body, kind, related, scheduled_for, requested_by):
    e164 = to_e164(to)
    msg, should_send = _claim(kind, body, e164, to, related, scheduled_for, requested_by)
    if not should_send:
        return msg
    mode = sms_mode()
    if e164 is None:
        return _finish(msg, "FAILED", error="Not a usable phone number.", provider=mode)
    if _opted_out(e164):
        return _finish(msg, "SKIPPED_OPTOUT", provider=mode)
    backend = get_backend(mode)
    if backend is None:
        return _finish(msg, "SKIPPED_DISABLED", provider=mode)
    if sent_today_count() >= settings.SMS_DAILY_LIMIT:
        return _finish(msg, "SKIPPED_LIMIT", provider=mode,
                       error=f"Daily limit of {settings.SMS_DAILY_LIMIT} reached.")

    septets = gsm_length(body)
    if septets is None or septets > 160:
        logger.warning(
            "SMS kind=%s is longer than one 160-char GSM segment (%s); it will be split.",
            kind, "unicode" if septets is None else f"{septets} chars",
        )
    try:
        result = backend.send(e164, body, str(msg.id), timeout=settings.SMS_TIMEOUT_SECONDS)
    except Exception as exc:  # noqa: BLE001 -- a provider bug must not escape
        logger.exception("SMS backend %s crashed (kind=%s)", mode, kind)
        return _finish(msg, "FAILED", error=f"Backend error: {type(exc).__name__}", provider=mode)
    if result.ok:
        return _finish(msg, "SENT", provider_id=result.provider_id, provider=mode)
    return _finish(msg, "FAILED", error=result.error, provider_id=result.provider_id, provider=mode)


def send_sms(to, body, kind, related=None, *, scheduled_for=None, requested_by=None):
    """Send one transactional SMS and return its SmsMessage row. Never raises.

    `related` (an Appointment or BoardingBooking) plus `scheduled_for` (the
    visit/stay date the text is about) form the idempotency key, so the same
    reminder for the same date is only ever sent once. Without `related` every
    call is a new message (the doctor's test SMS).
    """
    try:
        return _send(to, body, kind, related, scheduled_for, requested_by)
    except Exception:  # noqa: BLE001 -- see module docstring
        logger.exception("SMS send failed before reaching the provider (kind=%s); caller unaffected.", kind)
        return SmsMessage(to=to_e164(to) or "", body=body, kind=kind, status="FAILED",
                          error="Internal error while sending.")
