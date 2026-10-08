"""Helpers used by more than one domain module.

`problem` builds the RFC-7807 bodies every view returns. `_doctor_scoped`
is the queryset narrowing that 22 doctor routes rely on for object-level
authZ. `_rate_limited` / `_client_ip` are shared by password reset and the
public enquiry form. `_unique_owner_username` lives here because
serializers.py imports it too.

Split out of a single 1674-line views.py. Import from `appointments.views`
as before -- every public name is re-exported by the package.
"""

import logging
import re
from contextlib import contextmanager

from django.core.cache import cache
from django.db import DatabaseError
from django.db.models import Q
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from ..models import (
    UserProfile,
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


logger = logging.getLogger(__name__)

# One cap for every upload route (diagnoses, query attachments, pet photos).
# 4 MB because Vercel rejects request bodies over ~4.5 MB before Django runs
# (see serializers.MAX_UPLOAD_SIZE). Uploads are stored in Postgres
# (appointments/storage.py), so this also bounds Neon storage per file.
MAX_UPLOAD_BYTES = 4 * 1024 * 1024
UPLOAD_TOO_LARGE = "File is too large (max 4 MB)."
UPLOAD_STORAGE_UNAVAILABLE = "Upload storage unavailable, please try again."


def reject_oversized_upload(request):
    """A 400 problem if any file in the request is over the cap, else None.

    Checked before anything is created, so a too-large photo cannot leave a
    half-made pet behind, and every upload route answers with one message.
    """
    for _field, files in request.FILES.lists():
        for f in files:
            if (getattr(f, "size", 0) or 0) > MAX_UPLOAD_BYTES:
                return problem(400, UPLOAD_TOO_LARGE)
    return None


def reject_invalid_pet_photo(request):
    """A 400 problem if the request's `photo` is not a JPEG/PNG/WebP/HEIC
    image, else None. Checked before the pet is created or changed."""
    photo = request.FILES.get("photo")
    if not photo:
        return None
    # Imported here: serializers.py imports from this module.
    from rest_framework import serializers as drf_serializers
    from ..serializers import validate_pet_photo, PET_PHOTO_MESSAGE
    try:
        validate_pet_photo(photo)
    except drf_serializers.ValidationError:
        return problem(400, PET_PHOTO_MESSAGE)
    return None


class UploadStorageUnavailable(APIException):
    status_code = 503
    default_detail = UPLOAD_STORAGE_UNAVAILABLE
    default_code = "upload_storage_unavailable"


@contextmanager
def upload_storage_guard(request, operation):
    """Turn a storage failure into a 503 problem instead of an HTML 500.

    OSError covers a read-only or full filesystem (what Vercel produced);
    DatabaseError covers DatabaseStorage. Put any `transaction.atomic()`
    INSIDE this block so the rollback happens before the error is mapped.
    """
    try:
        yield
    except (OSError, DatabaseError):
        logger.exception(
            "upload storage failed: operation=%s user_id=%s",
            operation, getattr(getattr(request, "user", None), "pk", None),
        )
        raise UploadStorageUnavailable()


def save_pet_photo(request, pet, photo):
    """Store `photo` on `pet`, then free the photo it replaced."""
    old_name = pet.photo.name if pet.photo else ""
    with upload_storage_guard(request, "pet photo"):
        pet.photo = photo
        pet.save()
    if old_name and old_name != pet.photo.name:
        try:
            pet.photo.storage.delete(old_name)
        except (OSError, DatabaseError):
            logger.exception("could not delete replaced pet photo: pet_id=%s", pet.pk)


def maybe_doctor(request):
    """Return the DOCTOR user if the request carries a valid doctor token, else
    None. Never raises — a stale/absent token just means "treat as public".
    Shared by the public/doctor split-posture views (enquiries, facility, boarding)."""
    from rest_framework_simplejwt.authentication import JWTAuthentication
    from rest_framework.exceptions import AuthenticationFailed
    try:
        result = JWTAuthentication().authenticate(request)
    except AuthenticationFailed:
        return None
    if result is None:
        return None
    user, _token = result
    return user if getattr(user, "role", None) == "DOCTOR" else None


def require_doctor(request):
    """Doctor-only gate for @authentication_classes([]) views (which don't populate
    request.user). Returns (user, None) on success, or (None, problem_response) to
    return directly. One copy for every view that hand-authenticates a doctor —
    was duplicated verbatim in boarding, enquiries and facility."""
    from rest_framework_simplejwt.authentication import JWTAuthentication
    from rest_framework.exceptions import AuthenticationFailed
    try:
        result = JWTAuthentication().authenticate(request)
    except AuthenticationFailed as exc:
        return None, problem(401, "Not signed in", str(exc.detail) if exc.detail else "Invalid or expired token.")
    if result is None:
        return None, problem(401, "Not signed in", "Authentication credentials were not provided.")
    user, _token = result
    if getattr(user, "role", None) != "DOCTOR":
        return None, problem(403, "Not allowed", "This action requires a doctor account.")
    return user, None


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
    # NOTE (known limitation, deliberately NOT "fixed" with a spoofable header):
    # behind Cloudflare -> Vercel, REMOTE_ADDR is the edge, so per-IP limits share
    # a coarse bucket. Trusting CF-Connecting-IP or the left-most X-Forwarded-For
    # is WORSE — the *.vercel.app origin is directly reachable, so a client can
    # forge those and bypass/poison every per-IP limit. A coarse-but-unspoofable
    # key beats a precise-but-forgeable one. Proper fix needs (a) a shared rate-
    # limit cache — today it's per-instance LocMemCache, so the limit is already
    # soft on serverless — and (b) a header the trusted edge sets and clients
    # cannot (e.g. x-vercel-forwarded-for) with the origin locked to that edge.
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
