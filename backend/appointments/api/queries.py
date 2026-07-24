"""Owner <-> Doctor query threads (SRS §3.9) — Sprint 7.

This module is the BACKEND FOUNDATION for the query feature: the shared
attachment-validation contract plus importable STUB view classes so the frozen
route -> view-class wiring in ``api_urls.py`` resolves at import time. The
fan-out task fills in the view bodies against the same foundation (the
``Query`` / ``QueryMessage`` / ``QueryAttachment`` models + this validator);
it does NOT edit the frozen routes or ``forms.py``.

Attachment rules (SRS §3.9): a message carries 0-5 images, JPEG/PNG only, each
<=5MB. Validation lives HERE (not in the shared ``forms.py``) and rejects a bad
batch atomically — the whole POST returns 400 and no rows are written.

AuthZ in depth (CLAUDE.md rule 4): every access is scoped through
``pet.doctor`` — a doctor only ever sees or appends to threads for pets under
their own care; a pet they do not own 404s. ``sender`` / ``sender_role`` are
set server-side to ``request.user`` / ``DOCTOR`` and never read from the body.

APPEND-ONLY: messages are immutable — no update/delete path exists and the API
exposes no PUT/PATCH/DELETE on any query route (those methods 405).
"""

from rest_framework.exceptions import ValidationError

# NOTE (deferred): the OWNER side of a thread — an owner composing/sending a
# message — is intentionally NOT implemented in this sprint. Only the doctor can
# append messages here (``sender_role`` is hard-coded to DOCTOR server-side). The
# model supports owner-seeded messages (``QueryMessage.sender`` may be NULL,
# ``sender_role='OWNER'``) so an owner-send endpoint can be added later without a
# migration, but no such route/handler exists yet by design.

# ---------------------------------------------------------------------------
# Attachment-validation contract (SRS §3.9)
# ---------------------------------------------------------------------------
MAX_ATTACHMENTS = 5
MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024  # 5 MB per file, in bytes
ALLOWED_IMAGE_EXT = {".jpg", ".jpeg", ".png"}
ALLOWED_IMAGE_MIME = {"image/jpeg", "image/png"}


def _ext(filename):
    """Lower-cased file extension including the dot (``""`` if none)."""
    name = (filename or "").lower()
    dot = name.rfind(".")
    return name[dot:] if dot != -1 else ""


def validate_attachments(files):
    """Validate an uploaded batch of query-message attachments (SRS §3.9).

    ``files`` is the list of uploaded files for the ``attachments`` field (0-5).
    Enforces the shared contract: at most :data:`MAX_ATTACHMENTS`, each an
    allowed image type (by MIME and extension) and no larger than
    :data:`MAX_ATTACHMENT_SIZE`. Raises DRF :class:`ValidationError` (-> HTTP
    400) on the FIRST breach so the caller rejects the whole POST atomically and
    writes no rows. Returns the ``files`` list unchanged when the batch is valid.
    """
    files = list(files or [])
    if len(files) > MAX_ATTACHMENTS:
        raise ValidationError(
            {"attachments": [f"At most {MAX_ATTACHMENTS} attachments are allowed."]}
        )
    for f in files:
        mime = (getattr(f, "content_type", "") or "").lower()
        ext = _ext(getattr(f, "name", ""))
        if mime not in ALLOWED_IMAGE_MIME or ext not in ALLOWED_IMAGE_EXT:
            raise ValidationError(
                {"attachments": ["Only JPEG or PNG image attachments are allowed."]}
            )
        if getattr(f, "size", 0) > MAX_ATTACHMENT_SIZE:
            raise ValidationError(
                {"attachments": ["Each attachment must be 5MB or smaller."]}
            )
    return files


# ---------------------------------------------------------------------------
# View stubs — bodies filled by the fan-out task.
#
# Defined so ``api_urls`` imports resolve. Each subclasses the IsVet-guarded
# APIView pattern used across the API; the fan-out task replaces the ``get`` /
# ``post`` bodies with the real inbox + thread logic per the api_contract.
# ---------------------------------------------------------------------------
from django.db import transaction  # noqa: E402
from rest_framework import status  # noqa: E402
from rest_framework.parsers import FormParser, MultiPartParser  # noqa: E402
from rest_framework.response import Response  # noqa: E402
from rest_framework.views import APIView  # noqa: E402

from .core import IsVet, _owned_pet  # noqa: E402
from ..models import Query, QueryAttachment, QueryMessage  # noqa: E402
from ..serializers.queries import (  # noqa: E402
    InboxThreadSerializer,
    QueryMessageSerializer,
    QueryPetSummarySerializer,
)


class QueryInboxView(APIView):
    """GET /api/v1/queries/inbox — the doctor's query inbox.

    Lists one row per :class:`Query` thread whose pet is under the calling
    doctor's care (``pet.doctor == request.user`` — AuthZ in depth), newest
    activity first (``last_message_at`` desc). Each row carries the pet summary,
    a truncated last-message snippet (or ``null``), ``awaiting_reply`` (the last
    message was from the OWNER), and the total ``message_count``. Keyed under
    ``results`` to match the list-endpoint convention. Append-only: no
    PUT/PATCH/DELETE handlers -> DRF answers those methods 405.
    """

    permission_classes = [IsVet]

    def get(self, request):
        threads = (
            Query.objects.filter(pet__doctor=request.user)
            .select_related("pet")
            .order_by("-last_message_at", "-id")
        )
        data = InboxThreadSerializer(
            threads, many=True, context={"request": request}
        ).data
        return Response({"results": data})


class PetQueryThreadView(APIView):
    """GET+POST /api/v1/pets/<pet_pk>/queries — the per-pet thread (pet history).

    Ownership is enforced through ``pet.doctor == request.user`` (404 otherwise),
    so a doctor can never read or append to another doctor's pet thread.

    GET returns ``{pet, messages[]}`` oldest->newest (empty list when no thread
    exists yet). POST (multipart) appends a message: ``sender`` / ``sender_role``
    are set server-side to ``request.user`` / ``DOCTOR`` (any client-supplied
    sender is ignored), attachments are validated (0-5 JPEG/PNG, <=5MB each) and
    the whole write is atomic — a bad batch returns 400 with no rows written.

    APPEND-ONLY audit trail: only ``get``/``post`` are defined, so PUT, PATCH and
    DELETE resolve to DRF's 405 handler and no message is ever mutated or removed.
    """

    permission_classes = [IsVet]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, pet_pk):
        pet = _owned_pet(request, pet_pk)
        query = Query.objects.filter(pet=pet).first()
        messages = (
            query.messages.all()  # Meta.ordering -> oldest->newest
            if query is not None
            else QueryMessage.objects.none()
        )
        return Response(
            {
                "pet": QueryPetSummarySerializer(pet).data,
                "messages": QueryMessageSerializer(
                    messages, many=True, context={"request": request}
                ).data,
            }
        )

    def post(self, request, pet_pk):
        pet = _owned_pet(request, pet_pk)

        message_text = (request.data.get("message") or "").strip()
        files = request.FILES.getlist("attachments")

        # Validate the batch BEFORE any write so a rejected POST (6+ files,
        # non-image type, or oversized) leaves zero rows behind.
        validate_attachments(files)
        if not message_text and not files:
            raise ValidationError(
                {"message": ["A message or at least one attachment is required."]}
            )

        with transaction.atomic():
            query, _ = Query.objects.get_or_create(pet=pet)
            msg = QueryMessage.objects.create(
                query=query,
                sender=request.user,          # server-side, non-spoofable
                sender_role=QueryMessage.DOCTOR,  # server-side, ignores any body value
                message=message_text,
            )
            for f in files:
                QueryAttachment.objects.create(
                    message=msg,
                    file=f,
                    original_filename=f.name,
                    mime=(getattr(f, "content_type", "") or ""),
                    size=f.size,
                )
            query.last_message_at = msg.sent_at
            query.save(update_fields=["last_message_at"])

        # Notify the owner that the doctor replied (SRS §3.9 / §3.7).
        if pet.owner_id:
            from ..models import Notification
            from ..services.notifications import notify

            notify(
                pet.owner,
                Notification.MESSAGE_RECEIVED,
                f"{pet.name}: your clinic replied to your message.",
            )

        return Response(
            QueryMessageSerializer(msg, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )
