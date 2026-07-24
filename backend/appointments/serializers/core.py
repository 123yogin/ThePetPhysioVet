"""DRF serializers for the JSON API.

These are output-only shapes. Input validation deliberately reuses the existing
Django ``forms.py`` (DoctorLoginForm / DoctorSignupForm / PetForm /
AppointmentForm / RescheduleForm) inside the API views so the JSON API and the
template pages validate identically.
"""

import datetime

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import serializers

from ..models import Appointment, Diagnosis, Pet, ProgressNote, TreatmentPlan
from ..services.html import sanitize_html


class MeSerializer(serializers.ModelSerializer):
    """The authenticated doctor. ``clinic_name`` comes from DoctorProfile."""

    clinic_name = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "clinic_name", "role"]

    def get_clinic_name(self, obj):
        profile = getattr(obj, "doctor_profile", None)
        return profile.clinic_name if profile is not None else ""

    def get_role(self, obj):
        # DOCTOR wins if both exist; superusers are doctors.
        if hasattr(obj, "doctor_profile") or getattr(obj, "is_superuser", False):
            return "DOCTOR"
        if hasattr(obj, "owner_profile"):
            return "OWNER"
        return "DOCTOR"


class ProfileSerializer(serializers.ModelSerializer):
    """Read shape for the account/profile page. Extends the ``me`` fields with
    the role-specific profile details: clinic name/address/phone for a DOCTOR,
    contact ``phone`` for an OWNER (empty strings when the field/profile is
    absent, so the SPA form always has defined values to bind)."""

    role = serializers.SerializerMethodField()
    clinic_name = serializers.SerializerMethodField()
    clinic_address = serializers.SerializerMethodField()
    clinic_phone = serializers.SerializerMethodField()
    phone = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name", "role",
            "clinic_name", "clinic_address", "clinic_phone", "phone",
        ]

    def get_role(self, obj):
        if hasattr(obj, "doctor_profile") or getattr(obj, "is_superuser", False):
            return "DOCTOR"
        if hasattr(obj, "owner_profile"):
            return "OWNER"
        return "DOCTOR"

    def get_clinic_name(self, obj):
        p = getattr(obj, "doctor_profile", None)
        return p.clinic_name if p is not None else ""

    def get_clinic_address(self, obj):
        p = getattr(obj, "doctor_profile", None)
        return p.clinic_address if p is not None else ""

    def get_clinic_phone(self, obj):
        p = getattr(obj, "doctor_profile", None)
        return p.clinic_phone if p is not None else ""

    def get_phone(self, obj):
        p = getattr(obj, "owner_profile", None)
        return p.phone if p is not None else ""


class PetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pet
        fields = [
            "id", "name", "species", "pet_type", "breed", "age", "sex", "weight",
            "photo", "owner_name", "owner_phone", "owner_email", "medical_history",
            "complaint", "complaint_started", "referred_by", "notes",
        ]


class AppointmentSerializer(serializers.ModelSerializer):
    """Read shape for list / detail / dashboard cards.

    ``date`` serialises as ISO ``YYYY-MM-DD`` and ``time`` as ``HH:MM:SS``
    (DRF defaults); the React layer reproduces Django's display formatting from
    these raw values via lib/format.ts.
    """

    pet_name = serializers.CharField(read_only=True)
    pet_type = serializers.CharField(read_only=True)
    owner_name = serializers.CharField(read_only=True)
    visit_type_display = serializers.CharField(source="get_visit_type_display", read_only=True)

    class Meta:
        model = Appointment
        fields = [
            "id",
            "pet_name",
            "pet_type",
            "owner_name",
            "date",
            "time",
            "visit_type",
            "visit_type_display",
            "status",
            "requested_date",
            "requested_time",
            "reschedule_reason",
        ]


# ---------------------------------------------------------------------------
# Diagnostic reports (SRS §3.4)
# ---------------------------------------------------------------------------
class DiagnosisSerializer(serializers.ModelSerializer):
    """Read shape for a diagnostic report. ``file_url`` is an absolute /media
    URL built from the request; ``is_dicom`` drives the open-in-tab behaviour."""

    report_type_display = serializers.CharField(
        source="get_report_type_display", read_only=True
    )
    file_url = serializers.SerializerMethodField()
    is_dicom = serializers.BooleanField(read_only=True)

    class Meta:
        model = Diagnosis
        fields = [
            "id",
            "report_type",
            "report_type_display",
            "original_filename",
            "size",
            "mime",
            "uploaded_at",
            "notes",
            "file_url",
            "is_dicom",
        ]

    def get_file_url(self, obj):
        if not obj.file:
            return None
        request = self.context.get("request")
        url = obj.file.url
        return request.build_absolute_uri(url) if request is not None else url


# ---------------------------------------------------------------------------
# Treatment plans + progress notes (SRS §3.5)
# ---------------------------------------------------------------------------
class ProgressNoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProgressNote
        fields = ["id", "session_no", "notes", "created_at"]


class ProgressNoteCreateSerializer(serializers.ModelSerializer):
    """Write shape for adding a progress note. Sanitises the rich-text notes
    and rejects notes with no visible text."""

    class Meta:
        model = ProgressNote
        fields = ["session_no", "notes"]

    def validate_notes(self, value):
        from django.utils.html import strip_tags

        cleaned = sanitize_html(value or "")
        if not strip_tags(cleaned).strip():
            raise serializers.ValidationError("This field may not be blank.")
        return cleaned


class TreatmentPlanSerializer(serializers.ModelSerializer):
    """Read + write shape for a treatment plan.

    Validation enforces >= 1 valid therapy, custom fields when frequency /
    duration is CUSTOM, and derives ``end_date`` for the fixed 4WK/8WK
    durations. Completing a plan stamps ``completed_at``.
    """

    # Declared explicitly so it is required at the field level on create (a
    # plan must have >= 1 therapy); partial PATCH still skips it when absent.
    therapies = serializers.JSONField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    frequency_display = serializers.CharField(
        source="get_frequency_display", read_only=True
    )
    duration_display = serializers.CharField(
        source="get_duration_display", read_only=True
    )
    progress_notes = ProgressNoteSerializer(many=True, read_only=True)

    class Meta:
        model = TreatmentPlan
        fields = [
            "id",
            "pet",
            "therapies",
            "frequency",
            "frequency_custom",
            "frequency_display",
            "duration",
            "duration_custom",
            "duration_display",
            "start_date",
            "end_date",
            "status",
            "status_display",
            "completed_at",
            "created_at",
            "updated_at",
            "progress_notes",
        ]
        read_only_fields = ["pet", "completed_at", "created_at", "updated_at"]

    def _current(self, attrs, name, default=None):
        if name in attrs:
            return attrs[name]
        if self.instance is not None:
            return getattr(self.instance, name)
        return default

    def validate_therapies(self, value):
        if not isinstance(value, list) or len(value) == 0:
            raise serializers.ValidationError("Select at least one therapy.")
        invalid = [t for t in value if t not in TreatmentPlan.THERAPY_VALUES]
        if invalid:
            raise serializers.ValidationError(f"Invalid therapy: {invalid[0]}")
        return value

    def validate(self, attrs):
        if self._current(attrs, "frequency") == TreatmentPlan.FREQ_CUSTOM:
            if not (self._current(attrs, "frequency_custom", "") or "").strip():
                raise serializers.ValidationError(
                    {"frequency_custom": ["Required when frequency is Custom."]}
                )

        if self._current(attrs, "duration") == TreatmentPlan.DUR_CUSTOM:
            if not (self._current(attrs, "duration_custom", "") or "").strip():
                raise serializers.ValidationError(
                    {"duration_custom": ["Required when duration is Custom."]}
                )
            if not self._current(attrs, "end_date"):
                raise serializers.ValidationError(
                    {"end_date": ["Required when duration is Custom."]}
                )
        return attrs

    def _derive_end_date(self, attrs):
        duration = self._current(attrs, "duration")
        start = self._current(attrs, "start_date")
        if start and duration == TreatmentPlan.DUR_4WK:
            return start + datetime.timedelta(days=28)
        if start and duration == TreatmentPlan.DUR_8WK:
            return start + datetime.timedelta(days=56)
        # CUSTOM (or unknown) -> keep the captured end_date.
        return self._current(attrs, "end_date")

    def create(self, validated_data):
        validated_data["end_date"] = self._derive_end_date(validated_data)
        if validated_data.get("status") == TreatmentPlan.COMPLETED:
            validated_data["completed_at"] = timezone.now()
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data["end_date"] = self._derive_end_date(validated_data)
        new_status = validated_data.get("status")
        if new_status == TreatmentPlan.COMPLETED and instance.completed_at is None:
            validated_data["completed_at"] = timezone.now()
        return super().update(instance, validated_data)
