from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from .models import (
    UserProfile, Pet, Appointment, DiagnosticReport,
    TreatmentPlan, ProgressNote, Invoice, LineItem, Payment, Package,
    Notification, NotificationPref, QueryThread, QueryMessage, QueryAttachment,
)

# Upload validation constants (API_CONTRACT.md §3 "Diagnostic reports").
#
# Known-issue #9: `image/*` used to be accepted wholesale, which let
# `image/svg+xml` through. SVG is executable XML (can carry <script>) and is
# served back from the media origin, so it is a stored-XSS vector — replaced
# with an explicit allow-list of raster image types.
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_UPLOAD_TYPES = (
    "image/png", "image/jpeg", "image/gif", "image/webp",
    "application/pdf", "application/dicom",
)

# Content sniffing (API_CONTRACT.md §3 amendment 5, QA round 2 defect D1).
#
# The client-supplied `Content-Type` on a multipart part is 100% attacker
# controlled — validating it alone is a UX guard, not a security control. A
# Windows PE executable or a scriptable SVG relabelled `image/png` sailed
# straight through the allow-list above and out again from the media origin
# (stored XSS against clinicians for the SVG case). We now compare the
# file's actual leading bytes against the signature for the *declared*
# type and reject a mismatch with 400.
#
# Each entry is (byte_offset, signature_bytes_or_tuple_of_alternatives).
# DICOM is the one with a nonzero offset: a 128-byte preamble (traditionally
# zeroed, but not guaranteed to be) followed by the ASCII magic `DICM`.
_SIGNATURE_SNIFF_LENGTH = 132  # covers every offset+signature pair below

_FIXED_OFFSET_SIGNATURES = {
    "image/png": (0, b"\x89PNG\r\n\x1a\n"),
    # Real-world JPEGs vary in the marker after the SOI (APP0/APP1/etc.);
    # the SOI itself (FF D8 FF) is the stable, universal signature.
    "image/jpeg": (0, b"\xff\xd8\xff"),
    "image/gif": (0, (b"GIF87a", b"GIF89a")),
    "application/pdf": (0, b"%PDF-"),
    "application/dicom": (128, b"DICM"),
}


def _matches_signature(head, content_type):
    if content_type == "image/webp":
        # RIFF <4-byte size> WEBP — the size field is variable, so only the
        # RIFF container tag and the WEBP form type are checked.
        return head[:4] == b"RIFF" and head[8:12] == b"WEBP"
    entry = _FIXED_OFFSET_SIGNATURES.get(content_type)
    if entry is None:
        return False
    offset, signature = entry
    candidates = signature if isinstance(signature, tuple) else (signature,)
    chunk = head[offset:offset + max(len(s) for s in candidates)]
    return any(chunk.startswith(candidate) for candidate in candidates)


def _sniff_head(file_obj):
    file_obj.seek(0)
    head = file_obj.read(_SIGNATURE_SNIFF_LENGTH)
    file_obj.seek(0)
    return head


def _validate_upload(file_obj):
    if file_obj.size > MAX_UPLOAD_SIZE:
        raise serializers.ValidationError("File too large. Maximum size is 10 MB.")
    content_type = getattr(file_obj, "content_type", "") or ""
    if content_type not in ALLOWED_UPLOAD_TYPES:
        raise serializers.ValidationError(
            "Unsupported file type. Allowed: PNG/JPEG/GIF/WebP images, PDF, DICOM."
        )
    head = _sniff_head(file_obj)
    if not _matches_signature(head, content_type):
        raise serializers.ValidationError(
            "File content does not match its declared type."
        )
    return file_obj


class UserProfileSerializer(serializers.ModelSerializer):
    """Used both for GET /auth/me (read) and PATCH /auth/profile (write).

    Known-issue #1 (mass assignment): `role`, `username` and `id` must never
    be settable through a profile PATCH — a writable `role` let any owner
    escalate to DOCTOR and reuse their existing JWT to read every patient's
    PII. `is_staff`/`is_superuser` are deliberately not exposed as fields at
    all (see also SignupSerializer), so they can't be mass-assigned either.
    """

    class Meta:
        model = UserProfile
        fields = [
            "id", "username", "email", "first_name", "last_name",
            "role", "clinic_name", "clinic_address", "clinic_phone", "phone"
        ]
        read_only_fields = ["id", "username", "role"]


class SignupSerializer(serializers.ModelSerializer):
    """Used by POST /auth/signup. Hashes the password (bcrypt via
    PASSWORD_HASHERS) — never stores it plain, never returns it.

    AMENDED 2026-08-20 after QA round 1 (API_CONTRACT.md §3, known-issue #2):
    public signup always creates an OWNER. `role` is still validated for
    shape (so a garbage value like "ADMIN" is a 400) but its value is never
    honoured — an unauthenticated POST with role=DOCTOR used to mint a full
    clinician account with read access to every patient's PII and billing.
    Doctor accounts are provisioned out-of-band via `manage.py create_doctor`.
    """

    password = serializers.CharField(write_only=True, min_length=6)
    # Known-issue #8: email uniqueness was not enforced, so two accounts
    # could share an email and break password-reset / account recovery.
    email = serializers.EmailField(
        validators=[UniqueValidator(
            queryset=UserProfile.objects.all(),
            message="A user with that email already exists.",
        )],
    )

    class Meta:
        model = UserProfile
        fields = [
            "id", "username", "password", "email",
            "first_name", "last_name", "role", "phone",
        ]
        read_only_fields = ["id"]

    def validate_role(self, value):
        if value not in ("DOCTOR", "OWNER"):
            raise serializers.ValidationError("role must be DOCTOR or OWNER.")
        return value

    def create(self, validated_data):
        # Validated above, then discarded — public signup never honours a
        # client-supplied role.
        validated_data.pop("role", None)
        password = validated_data.pop("password")
        user = UserProfile(role="OWNER", **validated_data)
        user.set_password(password)
        user.save()
        return user


class PetSerializer(serializers.ModelSerializer):
    photo = serializers.SerializerMethodField()
    doctor_name = serializers.SerializerMethodField()

    class Meta:
        model = Pet
        fields = [
            "id", "name", "species", "pet_type", "breed", "age", "sex", "weight",
            "photo", "owner_name", "owner_phone", "owner_email",
            "medical_history", "complaint", "complaint_started", "referred_by", "notes",
            "doctor_name",
        ]
        # doctor_name is read-only because SerializerMethodField IS read-only —
        # it has no `to_internal_value`, so client input for it is discarded
        # before validation. Listing it below documents the intent, but does NOT
        # add a second control: DRF builds extra_kwargs from read_only_fields
        # only for fields it generates itself, and explicitly declared fields
        # bypass that path entirely. Do not treat this line as the thing
        # stopping an owner reassigning Pet.doctor (CLAUDE.md rule 4) — the
        # field type is. `doctor` is also absent from `fields` above, so it is
        # not writable through this serializer at all.
        read_only_fields = ["doctor_name"]

    def get_photo(self, obj):
        if not obj.photo:
            return None
        request = self.context.get("request")
        url = obj.photo.url
        return request.build_absolute_uri(url) if request else url

    def get_doctor_name(self, obj):
        doctor = obj.doctor
        if not doctor:
            return None
        full_name = f"{doctor.first_name} {doctor.last_name}".strip()
        return full_name or doctor.username


class OwnerPetHistorySerializer(serializers.ModelSerializer):
    """POST /owner/pets/:id/history (API_CONTRACT.md §3 Owner portal).

    Known-issue #10: this used to be raw `setattr()` + `save()` with no
    validation at all — a 5000-char string into a `max_length=50` column
    (`Pet.age`) returned 200 on SQLite and would be a 500 DataError on
    PostgreSQL. Routed through an explicit allowed-field whitelist so
    max_length / type validation actually runs.
    """

    class Meta:
        model = Pet
        fields = ["medical_history", "complaint", "notes", "age", "weight"]
        extra_kwargs = {field: {"required": False} for field in fields}


class AppointmentSerializer(serializers.ModelSerializer):
    pet = serializers.PrimaryKeyRelatedField(queryset=Pet.objects.all(), write_only=True)
    pet_id = serializers.IntegerField(source="pet.id", read_only=True)

    class Meta:
        model = Appointment
        fields = [
            "id", "pet", "pet_id", "pet_name", "owner_name", "owner_phone",
            "date", "time", "visit_type", "visit_type_display", "status",
            "requested_date", "requested_time", "reschedule_reason", "reason_notes",
        ]
        read_only_fields = [
            "pet_name", "owner_name", "owner_phone", "visit_type_display",
            "status", "requested_date", "requested_time", "reschedule_reason",
        ]

    def create(self, validated_data):
        pet = validated_data["pet"]
        validated_data.setdefault("pet_name", pet.name)
        validated_data.setdefault("owner_name", pet.owner_name)
        validated_data.setdefault("owner_phone", pet.owner_phone)
        return super().create(validated_data)


class DiagnosticReportSerializer(serializers.ModelSerializer):
    pet_id = serializers.IntegerField(source="pet.id", read_only=True)
    report_type_display = serializers.CharField(source="get_report_type_display", read_only=True)
    file_url = serializers.SerializerMethodField()
    is_dicom = serializers.SerializerMethodField()
    file = serializers.FileField(write_only=True)

    class Meta:
        model = DiagnosticReport
        fields = [
            "id", "pet_id", "report_type", "report_type_display",
            "original_filename", "size", "mime", "uploaded_at", "notes",
            "file_url", "is_dicom", "file",
        ]
        read_only_fields = ["original_filename", "size", "mime", "uploaded_at"]

    def get_file_url(self, obj):
        if not obj.file:
            return None
        request = self.context.get("request")
        url = obj.file.url
        return request.build_absolute_uri(url) if request else url

    def get_is_dicom(self, obj):
        return obj.mime == "application/dicom" or obj.original_filename.lower().endswith(".dcm")

    def validate_file(self, value):
        return _validate_upload(value)

    def create(self, validated_data):
        file_obj = validated_data.pop("file")
        validated_data["file"] = file_obj
        validated_data["original_filename"] = getattr(file_obj, "name", "")
        validated_data["size"] = getattr(file_obj, "size", 0)
        validated_data["mime"] = getattr(file_obj, "content_type", "") or ""
        return super().create(validated_data)


class ProgressNoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProgressNote
        fields = ["id", "session_no", "notes", "created_at"]


class TreatmentPlanSerializer(serializers.ModelSerializer):
    pet_id = serializers.IntegerField(source="pet.id", read_only=True)
    progress_notes = ProgressNoteSerializer(many=True, read_only=True)
    therapies = serializers.ListField(child=serializers.CharField(), default=list)

    class Meta:
        model = TreatmentPlan
        fields = [
            "id", "pet_id", "therapies", "frequency", "frequency_custom",
            "duration", "duration_custom", "start_date", "end_date", "status",
            "completed_at", "created_at", "updated_at", "progress_notes",
        ]


class LineItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = LineItem
        fields = ["id", "description", "quantity", "unit_price", "amount"]
        read_only_fields = ["amount"]
        # Known-issue #4: a negative unit_price/quantity minted a negative
        # invoice and dragged /revenue.total_revenue below zero. The model
        # field validators (MinValueValidator(0)) already propagate here via
        # ModelSerializer introspection; declared again explicitly so this
        # holds even if the model field ever loses its validator.
        extra_kwargs = {
            "quantity": {"min_value": 0},
            "unit_price": {"min_value": 0},
        }

    def validate(self, attrs):
        # amount is always server-computed from quantity * unit_price —
        # never trust a client-sent amount.
        quantity = attrs.get("quantity", 1)
        unit_price = attrs.get("unit_price", 0)
        attrs["amount"] = quantity * unit_price
        return attrs


class PaymentSerializer(serializers.ModelSerializer):
    invoice_id = serializers.IntegerField(source="invoice.id", read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id", "invoice_id", "amount_paid", "gateway_ref", "status",
            "paid_at", "idempotency_key",
        ]
        read_only_fields = ["status", "paid_at"]
        extra_kwargs = {"idempotency_key": {"write_only": True, "required": False}}


class PackageSerializer(serializers.ModelSerializer):
    invoice_id = serializers.IntegerField(source="invoice.id", read_only=True)
    remaining_sessions = serializers.IntegerField(read_only=True)

    class Meta:
        model = Package
        fields = ["id", "invoice_id", "total_sessions", "used_sessions", "remaining_sessions"]


class InvoiceSerializer(serializers.ModelSerializer):
    pet_id = serializers.SerializerMethodField()
    pet_name = serializers.SerializerMethodField()
    line_items = LineItemSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    package = PackageSerializer(read_only=True)

    # Server-computed — see Invoice model properties. Never accept these from
    # the client (API_CONTRACT.md §3 "Billing").
    subtotal = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    amount_paid = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    balance_due = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    payment_status = serializers.CharField(read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id", "invoice_no", "pet_id", "pet_name", "subtotal", "tax", "total",
            "payment_status", "payment_mode", "created_at", "line_items",
            "payments", "package", "amount_paid", "balance_due",
        ]
        read_only_fields = ["invoice_no", "created_at"]

    def get_pet_id(self, obj):
        return obj.pet_id

    def get_pet_name(self, obj):
        return obj.pet.name if obj.pet_id else None


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "type", "message", "is_read", "created_at", "link"]


class NotificationPrefSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationPref
        fields = ["id", "owner_phone", "sms_opt_out"]


class QueryAttachmentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    file = serializers.FileField(write_only=True)

    class Meta:
        model = QueryAttachment
        fields = ["id", "url", "original_filename", "mime", "size", "file"]
        read_only_fields = ["original_filename", "mime", "size"]

    def get_url(self, obj):
        if not obj.file:
            return None
        request = self.context.get("request")
        url = obj.file.url
        return request.build_absolute_uri(url) if request else url

    def validate_file(self, value):
        return _validate_upload(value)


class QueryMessageSerializer(serializers.ModelSerializer):
    attachments = QueryAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = QueryMessage
        fields = ["id", "sender_role", "sender_name", "message", "attachments", "sent_at"]
        read_only_fields = ["sender_role", "sender_name"]


class QueryThreadSerializer(serializers.ModelSerializer):
    pet = serializers.SerializerMethodField()
    messages = QueryMessageSerializer(many=True, read_only=True)
    last_message = serializers.SerializerMethodField()
    awaiting_reply = serializers.SerializerMethodField()
    message_count = serializers.SerializerMethodField()

    class Meta:
        model = QueryThread
        fields = ["pet", "messages", "last_message", "awaiting_reply", "message_count"]

    def get_pet(self, obj):
        return {
            "id": obj.pet.id,
            "name": obj.pet.name,
            "pet_type": obj.pet.pet_type or obj.pet.species,
            "owner_name": obj.pet.owner_name,
        }

    def _last_message(self, obj):
        return obj.messages.order_by("-sent_at").first()

    def get_last_message(self, obj):
        last = self._last_message(obj)
        if not last:
            return None
        snippet = last.message[:140]
        return {
            "snippet": snippet,
            "sent_at": last.sent_at,
            "sender_role": last.sender_role,
        }

    def get_awaiting_reply(self, obj):
        last = self._last_message(obj)
        return bool(last and last.sender_role == "OWNER")

    def get_message_count(self, obj):
        return obj.messages.count()
