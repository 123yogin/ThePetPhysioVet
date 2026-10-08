"""send_sms(): the one door every transactional text goes through.

Order of checks (each one recorded on the SmsMessage row):
  1. idempotency -- a unique key per (kind, related object, scheduled date) is
     INSERTed first; a duplicate returns the existing row and sends nothing.
     FAILED / SKIPPED_LIMIT / SKIPPED_DISABLED rows the provider never accepted
     are retried in place (claimed with a conditional UPDATE).
  2. a usable number (E.164; Indian numbers fold to +91)        -> FAILED
  3. its calling code is in SMS_ALLOWED_COUNTRY_CODES            -> SKIPPED_COUNTRY
  4. the owner's NotificationPref.sms_opt_out                    -> SKIPPED_OPTOUT
  5. SMS_BACKEND=disabled                                        -> SKIPPED_DISABLED
  6. under one lock (pg_advisory_xact_lock; SQLite serialises writers):
     the clinic's daily cap and SMS_PER_PHONE_DAILY_LIMIT        -> SKIPPED_LIMIT
     then the provider call, 5 s timeout                         -> SENT / FAILED
     A send that timed out keeps its sent_at, so it still uses a cap slot.

Provider/error text is scrubbed of anything that looks like a phone number
before it is stored or logged.

Hard rule, same as notify.py: this must NEVER break the request or cron run
that triggered it. Every failure is logged (phone masked, never credentials)
and returned as a FAILED row.
"""
import logging
import re
import uuid
from datetime import datetime, time, timedelta

from django.conf import settings
from django.db import IntegrityError, connection, transaction
from django.utils import timezone

from ..models import Appointment, BoardingBooking, NotificationPref, SmsMessage
from ..validators import phone_key
from .backends import get_backend

logger = logging.getLogger("appointments.sms")

RETRYABLE = ("FAILED", "SKIPPED_LIMIT", "SKIPPED_DISABLED")
INVALID_PHONE_ERROR = "Not a usable phone number."
_SEND_LOCK_KEY = 0x50485933  # next to boarding's 0x50485931/2
_PHONEISH = re.compile(r"\+?\d[\d\s().-]{5,}\d")

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


def _any_e164(raw):
    """E.164 for any plausible number, ignoring the allowlist. A number
    written without a country code is Indian (the clinic's patients are); one
    written with "+" keeps its own country code."""
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


def _country_allowed(e164):
    return any(e164.startswith(code) for code in settings.SMS_ALLOWED_COUNTRY_CODES)


def to_e164(raw):
    """E.164 for a number the clinic may text: plausible AND its calling code
    is in SMS_ALLOWED_COUNTRY_CODES. Else None."""
    e164 = _any_e164(raw)
    return e164 if e164 and _country_allowed(e164) else None


def scrub(text):
    """Mask anything phone-like (7+ digits) in provider/error text."""
    def _mask(m):
        return "[number]" if sum(c.isdigit() for c in m.group(0)) >= 7 else m.group(0)
    return _PHONEISH.sub(_mask, str(text or ""))


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


def _sent_today(exclude_pk=None, to=None):
    start, end = _today_bounds()
    qs = SmsMessage.objects.filter(sent_at__gte=start, sent_at__lt=end)
    if to is not None:
        qs = qs.filter(to=to)
    if exclude_pk is not None:
        qs = qs.exclude(pk=exclude_pk)
    return qs.count()


def sent_today_count():
    """Texts that may have gone out today (clinic's local day): accepted by
    the provider, or timed out without an answer. Counted by sent_at, so a
    later delivered/failed webhook does not free a slot."""
    return _sent_today()


def _opted_out(e164):
    """Opt-outs are stored however staff typed the number (9876543210,
    +919876543210, 00919876543210, 09876543210...): compare by phone_key."""
    key = phone_key(e164)
    if not key:
        return False
    candidates = NotificationPref.objects.filter(
        sms_opt_out=True, owner_phone__endswith=key[-7:],
    ).values_list("owner_phone", flat=True)
    return any(phone_key(p) == key for p in candidates)


def _lock_sends():
    """Serialise cap check + provider call across requests and cron runs.
    Transaction-scoped; Postgres only -- SQLite already serialises writers."""
    if connection.vendor == "postgresql":
        with connection.cursor() as cur:
            cur.execute("SELECT pg_advisory_xact_lock(%s)", [_SEND_LOCK_KEY])


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


def _finish(msg, status, *, error="", provider_id="", provider="", maybe_sent=False):
    msg.status = status
    msg.error = scrub(error)[:500]
    if provider_id:
        msg.provider_id = provider_id[:64]
    if provider:
        msg.provider = provider
    fields = ["status", "error", "provider_id", "provider", "updated_at"]
    if status == "SENT" or maybe_sent:
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
    # Retry only what the provider never acknowledged. A row with a
    # provider_id was accepted (a later webhook may have failed it): resending
    # would just hit the gateway's 409 and mislabel it SENT.
    if msg.status not in RETRYABLE or msg.provider_id:
        return msg, False
    claimed = SmsMessage.objects.filter(pk=msg.pk, status=msg.status, provider_id="").update(
        status="QUEUED", error="", body=body, to=to_value, updated_at=timezone.now(),
    )
    msg.refresh_from_db()
    return msg, bool(claimed)


def _send(to, body, kind, related, scheduled_for, requested_by):
    any_e164 = _any_e164(to)
    e164 = any_e164 if any_e164 and _country_allowed(any_e164) else None
    msg, should_send = _claim(kind, body, any_e164, to, related, scheduled_for, requested_by)
    if not should_send:
        return msg
    mode = sms_mode()
    if any_e164 is None:
        return _finish(msg, "FAILED", error=INVALID_PHONE_ERROR, provider=mode)
    if e164 is None:
        allowed = ", ".join(settings.SMS_ALLOWED_COUNTRY_CODES)
        return _finish(msg, "SKIPPED_COUNTRY", provider=mode,
                       error=f"Number starting {any_e164[:4]} is outside SMS_ALLOWED_COUNTRY_CODES ({allowed}).")
    if _opted_out(e164):
        return _finish(msg, "SKIPPED_OPTOUT", provider=mode)
    backend = get_backend(mode)
    if backend is None:
        return _finish(msg, "SKIPPED_DISABLED", provider=mode)

    septets = gsm_length(body)
    if septets is None or septets > 160:
        logger.warning(
            "SMS kind=%s is longer than one 160-char GSM segment (%s); it will be split.",
            kind, "unicode" if septets is None else f"{septets} chars",
        )
    with transaction.atomic():
        _lock_sends()
        if _sent_today(exclude_pk=msg.pk) >= settings.SMS_DAILY_LIMIT:
            return _finish(msg, "SKIPPED_LIMIT", provider=mode,
                           error=f"Daily limit of {settings.SMS_DAILY_LIMIT} reached.")
        if _sent_today(exclude_pk=msg.pk, to=e164) >= settings.SMS_PER_PHONE_DAILY_LIMIT:
            return _finish(msg, "SKIPPED_LIMIT", provider=mode,
                           error=f"Daily limit of {settings.SMS_PER_PHONE_DAILY_LIMIT} texts to this number reached.")
        msg.provider_attempted = True  # not a column: lets the cron's breaker tell provider failures apart
        try:
            result = backend.send(e164, body, str(msg.id), timeout=settings.SMS_TIMEOUT_SECONDS)
        except Exception as exc:  # noqa: BLE001 -- a provider bug must not escape
            logger.exception("SMS backend %s crashed (kind=%s)", mode, kind)
            return _finish(msg, "FAILED", error=f"Backend error: {type(exc).__name__}", provider=mode,
                           maybe_sent=True)
        if result.ok:
            return _finish(msg, "SENT", provider_id=result.provider_id, provider=mode)
        error = result.error + (" (no answer; it may have been sent)" if result.uncertain else "")
        return _finish(msg, "FAILED", error=error, provider_id=result.provider_id, provider=mode,
                       maybe_sent=result.uncertain)


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
