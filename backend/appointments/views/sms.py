"""SMS: the doctor's log + test send, the Vercel Cron reminder run, and the
gateway's delivery-status webhook.

  GET  /sms/log               doctor -- recent messages, phone masked, + mode/cap
  POST /sms/test {to}         doctor -- "Pet Physio Vet test message" (counts toward the cap)
  GET  /cron/sms-reminders    Vercel Cron -- Authorization: Bearer $CRON_SECRET
  POST /sms/webhook           gateway -- HMAC-signed (X-Signature / X-Timestamp)

The last two are AllowAny with no authenticators because their callers are
machines holding a shared secret, not users holding a JWT; each checks its
secret by hand, in constant time, before touching anything (see the
ALLOWANY_ALLOWLIST note in test_authz.py).
"""
import hmac
import json
import logging

from django.conf import settings
from django.db.models import Q
from rest_framework import serializers, status as http_status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from ..models import SmsMessage
from ..permissions import IsDoctor
from ..sms import mask_phone, send_sms, sent_today_count, sms_mode
from ..sms import templates
from ..sms.triggers import run_daily_reminders
from ..sms.webhook import WebhookEventSerializer, apply_event, signature_ok
from ..validators import normalise_phone
from ._shared import _first_error_detail, _rate_limited, problem

logger = logging.getLogger("appointments.sms")

PAGE_SIZE_DEFAULT = 25
PAGE_SIZE_MAX = 100
TEST_SMS_LIMIT_PER_HOUR = 10


class SmsLogEntrySerializer(serializers.ModelSerializer):
    to = serializers.SerializerMethodField()

    class Meta:
        model = SmsMessage
        fields = ("id", "created_at", "sent_at", "to", "kind", "status", "error", "provider")

    def get_to(self, obj):
        return mask_phone(obj.to)


class SmsTestRequestSerializer(serializers.Serializer):
    to = serializers.CharField(max_length=50)

    def validate_to(self, value):
        from ..sms import to_e164
        cleaned = normalise_phone(value)
        if not cleaned or to_e164(cleaned) is None:
            raise serializers.ValidationError(
                "Enter a mobile number, e.g. 98765 43210 or +91 98765 43210."
            )
        return cleaned


def _positive_int(raw, default, maximum=None):
    if raw in (None, ""):
        return default
    value = int(raw)  # ValueError -> 400 by the caller
    if value < 1:
        raise ValueError
    return min(value, maximum) if maximum else value


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsDoctor])
def sms_log_view(request):
    try:
        page = _positive_int(request.query_params.get("page"), 1)
        size = _positive_int(request.query_params.get("page_size"), PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX)
    except ValueError:
        return problem(400, "Invalid page", "page and page_size must be positive integers.")
    # Same posture as _doctor_scoped: a text about another doctor's patient is
    # not listed; clinic-level texts (boarding, tests) are.
    qs = SmsMessage.objects.filter(
        Q(appointment__isnull=True) | Q(appointment__doctor=request.user)
        | Q(appointment__doctor__isnull=True)
    ).order_by("-created_at")
    count = qs.count()
    rows = qs[(page - 1) * size: page * size]
    return Response({
        "mode": sms_mode(),
        "sent_today": sent_today_count(),
        "daily_limit": settings.SMS_DAILY_LIMIT,
        "count": count,
        "page": page,
        "page_size": size,
        "results": SmsLogEntrySerializer(rows, many=True).data,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def sms_test_view(request):
    ser = SmsTestRequestSerializer(data=request.data)
    if not ser.is_valid():
        return problem(400, "Invalid input", _first_error_detail(ser.errors))
    if _rate_limited(f"sms:test:{request.user.pk}", TEST_SMS_LIMIT_PER_HOUR, 60 * 60):
        return problem(429, "Too many requests", "Too many test messages. Please wait a while.")
    msg = send_sms(ser.validated_data["to"], templates.test_message(), kind="test",
                   requested_by=request.user)
    return Response(SmsLogEntrySerializer(msg).data, status=http_status.HTTP_201_CREATED)


def _bearer_matches(request, secret):
    if not secret:
        return False
    header = request.META.get("HTTP_AUTHORIZATION", "")
    return hmac.compare_digest(header.encode(), f"Bearer {secret}".encode())


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def cron_sms_reminders_view(request):
    if not _bearer_matches(request, settings.CRON_SECRET):
        return problem(401, "Not signed in", "A valid cron secret is required.")
    return Response(run_daily_reminders())


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def sms_webhook_view(request):
    key = settings.SMS_WEBHOOK_SIGNING_KEY
    if not key:
        return problem(404, "Not found", "That record does not exist, or you do not have access to it.")
    raw = request.body  # read before DRF parses, so the HMAC covers the exact bytes
    if not signature_ok(key, raw, request.META.get("HTTP_X_TIMESTAMP"), request.META.get("HTTP_X_SIGNATURE")):
        return problem(401, "Invalid signature", "The webhook signature is missing, wrong or expired.")
    try:
        data = json.loads(raw or b"{}")
    except ValueError:
        return problem(400, "Invalid input", "Body must be JSON.")
    ser = WebhookEventSerializer(data=data if isinstance(data, dict) else {})
    if not ser.is_valid():
        return problem(400, "Invalid input", _first_error_detail(ser.errors))
    outcome = apply_event(ser.validated_data["event"], ser.validated_data["payload"])
    return Response({"result": outcome})
