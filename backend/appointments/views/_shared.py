"""Helpers used by more than one domain module.

`problem` builds the RFC-7807 bodies every view returns. `_doctor_scoped`
is the queryset narrowing that 22 doctor routes rely on for object-level
authZ. `_rate_limited` / `_client_ip` are shared by password reset and the
public enquiry form. `_unique_owner_username` lives here because
serializers.py imports it too.

Split out of a single 1674-line views.py. Import from `appointments.views`
as before -- every public name is re-exported by the package.
"""

import re
from django.core.cache import cache
from django.db.models import Max, Q
from rest_framework.response import Response
from ..models import (
    UserProfile, Pet, Appointment, DiagnosticReport,
    TreatmentPlan, ProgressNote, Invoice, LineItem, Payment, Package,
    Notification, NotificationPref, QueryThread, QueryMessage, QueryAttachment,
    PasswordResetToken, Enquiry,
)

def problem(status_code, title, detail=None):
    """A minimal RFC-7807 problem-details body for hand-rolled errors.

    (Serializer validation errors still go through DRF's default exception
    handler, which is configured in settings.py — out of scope for this
    file's ownership.)

    Known-issue #12: `detail` used to be omitted whenever the caller didn't
    pass one explicitly. `frontend/src/lib/http.ts` reads
    `detail || message || statusText`, so every hand-rolled 400 without an
    explicit detail rendered as a bare "Bad Request". `detail` now always
    falls back to `title` so the SPA always has something real to show.
    """
    body = {"type": "about:blank", "title": title, "status": status_code, "detail": detail or title}
    return Response(body, status=status_code)


def _first_error_detail(errors):
    """Flatten a DRF serializer `.errors` dict into one human-readable
    string for a `problem()` `detail` — see `problem()`'s docstring:
    without this, a serializer-validation 400 has no `detail` key at all
    and the SPA falls through to the literal words "Bad Request".
    """
    for field, msgs in errors.items():
        first = msgs[0] if isinstance(msgs, (list, tuple)) and msgs else msgs
        return f"{field}: {first}"
    return "Invalid input."


def _doctor_scoped(model, request, lookup="doctor"):
    """Doctor object-level scoping (CLAUDE.md rule 4 / API_CONTRACT.md §4.6).

    A row whose `lookup` FK resolves to a DIFFERENT doctor must never be
    reachable at all — not just hidden from list endpoints. This is used as
    the base queryset for BOTH `GET`-many views and `get_object_or_404` on
    single-object routes, so list and detail scoping can never drift apart
    again (that drift is exactly how the first L1 pass left every
    detail/action route reachable by ID while the list endpoints were
    fixed — a second doctor could read/reschedule/complete/invoice another
    practice's patient by guessing or enumerating IDs).

    Rows where `lookup` is NULL are a CLAIMABLE POOL: visible to ANY doctor,
    not hidden from all of them. A brand-new owner's first pet has
    `doctor = null` until a doctor's practice can be inferred (see
    `owner_pets_view`), and nothing else in this codebase lets a doctor
    claim a patient after the fact — treating NULL as "nobody's" would make
    that pet (and anything hanging off it: appointments, diagnostic
    reports, treatment plans, invoices) permanently unreachable by any
    doctor. This mirrors the "doctor-visible to all, never owner-visible"
    posture already used for orphan (`pet=null`) invoices.

    `lookup` is a Django `__`-lookup path to the doctor FK: `"doctor"` for
    models with a direct FK (Pet, Appointment), `"pet__doctor"` for models
    reached only through their pet (DiagnosticReport, TreatmentPlan,
    Invoice — Invoice.pet is itself nullable, and `pet__doctor__isnull=True`
    correctly matches both "pet has no doctor" and "no pet at all" through
    the same LEFT OUTER JOIN), `"invoice__pet__doctor"` for Payment.
    """
    return model.objects.filter(
        Q(**{lookup: request.user}) | Q(**{f"{lookup}__isnull": True})
    )


def _rate_limited(key, limit, window_seconds):
    """Fixed-window counter. Returns True once `limit` requests have
    already landed for `key` within the current window (and leaves the
    counter alone past that point, i.e. never resets early from being
    hammered).
    """
    try:
        count = cache.incr(key)
    except ValueError:
        # First request in a fresh window — cache.incr() raises ValueError
        # when the key doesn't exist yet (rather than starting at 0).
        cache.set(key, 1, timeout=window_seconds)
        return False
    return count > limit


def _client_ip(request):
    return request.META.get("REMOTE_ADDR") or "unknown"


def _unique_owner_username(email):
    """Derive a UserProfile.username (required, unique) from an email local
    part for an owner account created out-of-band during enquiry conversion
    — this person has never chosen a username because they have never
    signed up. Falls back to, then numbers past, `"owner"` if the local
    part is empty/all-symbols or already taken.
    """
    base = re.sub(r"[^a-zA-Z0-9_.-]", "", (email or "").split("@")[0])[:30] or "owner"
    username = base
    suffix = 0
    while UserProfile.objects.filter(username=username).exists():
        suffix += 1
        username = f"{base}{suffix}"[:150]
    return username
