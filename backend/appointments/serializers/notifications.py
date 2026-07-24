"""Shared serializers for the notifications domain (SRS §3.7, §7).

Output shapes consumed by the feed / prefs / device views. This is a SHARED
foundation module — fan-out tasks import it read-only and do not edit it.
"""

from rest_framework import serializers

from ..models import Notification, NotificationPref


class NotificationSerializer(serializers.ModelSerializer):
    """Read shape for the doctor's notification feed."""

    type_display = serializers.CharField(source="get_type_display", read_only=True)

    class Meta:
        model = Notification
        fields = ["id", "type", "type_display", "message", "is_read", "created_at"]
        read_only_fields = fields


class NotificationPrefSerializer(serializers.ModelSerializer):
    """SMS opt-out preference keyed by owner phone (SRS §3.7 AC-03).

    ``owner_phone`` and ``sms_opt_out`` are writable so the prefs endpoint can
    set them; ``id`` / ``updated_at`` are read-only.
    """

    class Meta:
        model = NotificationPref
        fields = ["id", "owner_phone", "sms_opt_out", "updated_at"]
        read_only_fields = ["id", "updated_at"]
