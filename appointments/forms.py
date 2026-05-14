from django import forms
from django.contrib.auth.forms import AuthenticationForm, UserCreationForm
from django.contrib.auth.models import User

from .models import Appointment, DoctorProfile


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


class AppointmentForm(forms.ModelForm):
    class Meta:
        model = Appointment
        fields = [
            "pet_name",
            "pet_type",
            "owner_name",
            "owner_phone",
            "visit_type",
            "date",
            "time",
            "reason_notes",
        ]
        widgets = {
            "pet_name": forms.TextInput(attrs={"class": "input-glass"}),
            "pet_type": forms.TextInput(attrs={"class": "input-glass", "placeholder": "e.g. Dog, Cat"}),
            "owner_name": forms.TextInput(attrs={"class": "input-glass"}),
            "owner_phone": forms.TextInput(attrs={"class": "input-glass"}),
            "visit_type": forms.RadioSelect(),
            "date": forms.DateInput(attrs={"type": "date", "class": "input-glass"}),
            "time": forms.TimeInput(attrs={"type": "time", "class": "input-glass"}),
            "reason_notes": forms.Textarea(attrs={"rows": 3, "class": "input-glass", "placeholder": "Reason / notes"}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
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
