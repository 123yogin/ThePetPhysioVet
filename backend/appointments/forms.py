import os

from django import forms
from django.contrib.auth.forms import AuthenticationForm, UserCreationForm
from django.contrib.auth.models import User

from .models import Appointment, Diagnosis, DoctorProfile, Pet
from .services.html import sanitize_html

# --- Diagnostic-report upload validation (SRS §3.4) ------------------------
MAX_UPLOAD_SIZE = 20 * 1024 * 1024  # 20 MB

# Allowlist by BOTH file extension and content mime. DICOM is frequently sent
# as application/octet-stream (or with no type at all), so those are accepted
# only for the .dcm/.dicom extensions.
ALLOWED_UPLOAD_TYPES = {
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".png": {"image/png"},
    ".pdf": {"application/pdf"},
    ".dcm": {"application/dicom", "application/octet-stream", ""},
    ".dicom": {"application/dicom", "application/octet-stream", ""},
}

_TYPE_ERROR = (
    "Unsupported file type. Upload an image (.jpg/.jpeg/.png), a PDF (.pdf), "
    "or a DICOM file (.dcm/.dicom)."
)


def validate_upload(uploaded):
    """Validate an uploaded diagnostic report by extension + mime + size.

    Raises ``forms.ValidationError`` with a clear message on failure.
    """
    ext = os.path.splitext(uploaded.name or "")[1].lower()
    if ext not in ALLOWED_UPLOAD_TYPES:
        raise forms.ValidationError(_TYPE_ERROR)
    mime = (getattr(uploaded, "content_type", "") or "").lower()
    allowed = ALLOWED_UPLOAD_TYPES[ext]
    image_ok = ext in (".jpg", ".jpeg", ".png") and mime.startswith("image/")
    if mime not in allowed and not image_ok:
        raise forms.ValidationError(_TYPE_ERROR)
    if uploaded.size > MAX_UPLOAD_SIZE:
        raise forms.ValidationError("File exceeds the 20MB limit.")
    return uploaded


class DoctorLoginForm(AuthenticationForm):
    username = forms.CharField(
        label="Email or username",
        widget=forms.TextInput(attrs={"autocomplete": "username", "class": "input-glass"}),
    )
    password = forms.CharField(
        label="Password",
        strip=False,
        widget=forms.PasswordInput(attrs={"autocomplete": "current-password", "class": "input-glass"}),
    )


class DoctorSignupForm(UserCreationForm):
    email = forms.EmailField(required=True, widget=forms.EmailInput(attrs={"class": "input-glass"}))
    first_name = forms.CharField(max_length=150, widget=forms.TextInput(attrs={"class": "input-glass"}))
    last_name = forms.CharField(
        max_length=150,
        required=False,
        widget=forms.TextInput(attrs={"class": "input-glass"}),
    )
    clinic_name = forms.CharField(
        max_length=200,
        required=False,
        widget=forms.TextInput(attrs={"class": "input-glass", "placeholder": "Clinic name"}),
    )
    clinic_address = forms.CharField(
        required=False,
        widget=forms.Textarea(attrs={"rows": 2, "class": "input-glass", "placeholder": "Clinic address"}),
    )

    class Meta:
        model = User
        fields = ("username", "email", "first_name", "last_name", "password1", "password2")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for name in ("username", "password1", "password2"):
            if name in self.fields:
                self.fields[name].widget.attrs.setdefault("class", "input-glass")
        self.fields["password1"].help_text = ""
        self.fields["password2"].help_text = ""

    def clean_email(self):
        email = self.cleaned_data["email"].strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError("An account with this email already exists.")
        return email

    def save(self, commit=True):
        user = super().save(commit=False)
        user.email = self.cleaned_data["email"]
        user.first_name = self.cleaned_data.get("first_name", "").strip()
        user.last_name = self.cleaned_data.get("last_name", "").strip()
        if commit:
            user.save()
            DoctorProfile.objects.update_or_create(
                user=user,
                defaults={
                    "clinic_name": self.cleaned_data.get("clinic_name", "").strip(),
                    "clinic_address": self.cleaned_data.get("clinic_address", "").strip(),
                },
            )
        return user


class PetForm(forms.ModelForm):
    class Meta:
        model = Pet
        # SRS §3.3 clinical + owner fields. Only name + owner_name/phone are
        # required at the model level; the rest are optional (blank/null).
        fields = [
            "name", "species", "pet_type", "breed", "age", "sex", "weight", "photo",
            "owner_name", "owner_phone", "owner_email", "medical_history",
            "complaint", "complaint_started", "referred_by", "notes",
        ]
        widgets = {
            "name": forms.TextInput(attrs={"class": "input-glass"}),
            "pet_type": forms.TextInput(attrs={"class": "input-glass", "placeholder": "e.g. Dog, Cat"}),
            "breed": forms.TextInput(attrs={"class": "input-glass"}),
            "age": forms.TextInput(attrs={"class": "input-glass", "placeholder": "e.g. 4 years"}),
            "owner_name": forms.TextInput(attrs={"class": "input-glass"}),
            "owner_phone": forms.TextInput(attrs={"class": "input-glass"}),
            "owner_email": forms.EmailInput(attrs={"class": "input-glass"}),
            "medical_history": forms.Textarea(attrs={"rows": 3, "class": "input-glass"}),
            "complaint": forms.Textarea(attrs={"rows": 2, "class": "input-glass"}),
            "complaint_started": forms.DateInput(attrs={"type": "date", "class": "input-glass"}),
            "referred_by": forms.TextInput(attrs={"class": "input-glass"}),
            "notes": forms.Textarea(attrs={"rows": 3, "class": "input-glass", "placeholder": "General notes (optional)"}),
        }
        labels = {"name": "Pet name", "species": "Species", "pet_type": "Type (legacy)"}


class AppointmentForm(forms.ModelForm):
    class Meta:
        model = Appointment
        fields = [
            "pet",
            "visit_type",
            "date",
            "time",
            "reason_notes",
        ]
        widgets = {
            "pet": forms.Select(attrs={"class": "input-glass"}),
            "visit_type": forms.RadioSelect(),
            "date": forms.DateInput(attrs={"type": "date", "class": "input-glass"}),
            "time": forms.TimeInput(attrs={"type": "time", "class": "input-glass"}),
            "reason_notes": forms.Textarea(attrs={"rows": 3, "class": "input-glass", "placeholder": "Reason / notes"}),
        }

    def __init__(self, *args, doctor=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["pet"].label = "Patient"
        if doctor is not None:
            self.fields["pet"].queryset = Pet.objects.filter(doctor=doctor)
        self.fields["visit_type"].label = "Visit type"
        self.fields["visit_type"].help_text = "Clinic = owner comes to you. Home = you visit the pet at their location."


class RescheduleForm(forms.ModelForm):
    class Meta:
        model = Appointment
        fields = ["date", "time"]
        widgets = {
            "date": forms.DateInput(attrs={"type": "date", "class": "input-glass"}),
            "time": forms.TimeInput(attrs={"type": "time", "class": "input-glass"}),
        }


class DiagnosisUploadForm(forms.Form):
    """Validate a diagnostic-report upload (report_type + notes + file)."""

    report_type = forms.ChoiceField(choices=Diagnosis.REPORT_TYPE_CHOICES)
    notes = forms.CharField(required=False, widget=forms.Textarea)
    file = forms.FileField()

    def clean_notes(self):
        return sanitize_html(self.cleaned_data.get("notes", ""))

    def clean_file(self):
        return validate_upload(self.cleaned_data["file"])


class DiagnosisReplaceForm(forms.Form):
    """Validate a replacement file for an existing diagnosis (same rules)."""

    file = forms.FileField()

    def clean_file(self):
        return validate_upload(self.cleaned_data["file"])
