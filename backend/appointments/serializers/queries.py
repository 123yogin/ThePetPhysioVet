"""DRF serializers for the Owner <-> Doctor query threads (SRS §3.9) — Sprint 7.

Output-only read shapes for the doctor-side inbox and per-pet thread. Attachment
URLs are built with ``request.build_absolute_uri`` — mirroring
``DiagnosisSerializer.get_file_url`` — and are only ever returned inside an
already-ownership-gated thread/inbox response (``pet.doctor == request.user``),
so a file is never exposed to a doctor who does not own the pet.
"""

from django.utils.text import Truncator
from rest_framework import serializers

from ..models import Pet, QueryAttachment, QueryMessage

SNIPPET_CHARS = 80


class QueryPetSummarySerializer(serializers.ModelSerializer):
    """Compact pet header used by both the inbox row and the thread response."""

    class Meta:
        model = Pet
        fields = ["id", "name", "pet_type", "owner_name"]


class QueryAttachmentSerializer(serializers.ModelSerializer):
    """One image attachment on a message. ``url`` is an absolute /media URL."""

    url = serializers.SerializerMethodField()

    class Meta:
        model = QueryAttachment
        fields = ["id", "url", "original_filename", "mime", "size"]

    def get_url(self, obj):
        if not obj.file:
            return None
        request = self.context.get("request")
        url = obj.file.url
        return request.build_absolute_uri(url) if request is not None else url


class QueryMessageSerializer(serializers.ModelSerializer):
    """One append-only message in a thread (oldest->newest ordering upstream)."""

    sender_name = serializers.SerializerMethodField()
    attachments = QueryAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = QueryMessage
        fields = [
            "id",
            "sender_role",
            "sender_name",
            "message",
            "attachments",
            "sent_at",
        ]

    def get_sender_name(self, obj):
        if obj.sender is not None:
            return obj.sender.get_full_name() or obj.sender.get_username()
        # sender is NULL only for owner-seeded messages (owner has no User yet);
        # fall back to the pet's owner name so the thread still attributes it.
        if obj.sender_role == QueryMessage.OWNER:
            return obj.query.pet.owner_name
        return ""


class InboxThreadSerializer(serializers.Serializer):
    """One inbox row for a ``Query`` thread under the doctor's care."""

    pet = QueryPetSummarySerializer(read_only=True)
    last_message = serializers.SerializerMethodField()
    awaiting_reply = serializers.SerializerMethodField()
    message_count = serializers.SerializerMethodField()

    def _last(self, obj):
        # Newest message in the thread (messages default-order oldest->newest).
        return obj.messages.order_by("-sent_at", "-id").first()

    def get_last_message(self, obj):
        msg = self._last(obj)
        if msg is None:
            return None
        return {
            "snippet": Truncator(msg.message).chars(SNIPPET_CHARS),
            "sent_at": msg.sent_at,
            "sender_role": msg.sender_role,
        }

    def get_awaiting_reply(self, obj):
        msg = self._last(obj)
        return msg is not None and msg.sender_role == QueryMessage.OWNER

    def get_message_count(self, obj):
        return obj.messages.count()
