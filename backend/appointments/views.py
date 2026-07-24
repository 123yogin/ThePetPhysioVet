from functools import wraps

from django.conf import settings
from django.contrib import messages
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_http_methods, require_POST

from .forms import AppointmentForm, DoctorLoginForm, DoctorSignupForm, PetForm, RescheduleForm
from .models import Appointment, DoctorProfile, Pet
from .services.html import build_share_urls, share_body


def vet_required(view_func):
    @wraps(view_func)
    def _wrapped(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return redirect("login")
        if request.user.is_superuser:
            DoctorProfile.objects.get_or_create(
                user=request.user,
                defaults={"clinic_name": "", "clinic_address": "", "clinic_phone": ""},
            )
        if not hasattr(request.user, "doctor_profile"):
            messages.error(request, "This portal is for registered veterinarians only.")
            logout(request)
            return redirect("login")
        return view_func(request, *args, **kwargs)

    return _wrapped


def home(request):
    if request.user.is_authenticated and hasattr(request.user, "doctor_profile"):
        return redirect("dashboard")
    return redirect("login")


@require_http_methods(["GET", "POST"])
def login_view(request):
    if request.user.is_authenticated and hasattr(request.user, "doctor_profile"):
        return redirect("dashboard")
    form = DoctorLoginForm(request, data=request.POST or None)
    if request.method == "POST" and form.is_valid():
        login(request, form.get_user())
        messages.success(request, "Welcome back.")
        return redirect("dashboard")
    return render(request, "vet/login.html", {"form": form})


@require_http_methods(["GET", "POST"])
def signup_view(request):
    if request.user.is_authenticated:
        return redirect("dashboard")
    form = DoctorSignupForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        user = form.save()
        auth_user = authenticate(
            request,
            username=user.get_username(),
            password=form.cleaned_data["password1"],
        )
        if auth_user is not None:
            login(request, auth_user)
        else:
            login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        messages.success(request, "Your clinic account is ready.")
        return redirect("dashboard")
    return render(request, "vet/signup.html", {"form": form})


def logout_view(request):
    logout(request)
    messages.info(request, "You have been signed out.")
    return redirect("login")


@login_required
@vet_required
def dashboard(request):
    # PARITY_TODAY pins "today" during the UI-parity check; it is None (real
    # clock) unless the env var is set, so production behaviour is unchanged.
    today = getattr(settings, "PARITY_TODAY", None) or timezone.localdate()
    today_qs = (
        Appointment.objects.filter(doctor=request.user, date=today)
        .exclude(status=Appointment.STATUS_COMPLETED)
        .order_by("time", "id")
    )
    completed_count = Appointment.objects.filter(
        doctor=request.user, status=Appointment.STATUS_COMPLETED
    ).count()
    return render(
        request,
        "vet/dashboard.html",
        {
            "today_appointments": today_qs,
            "completed_count": completed_count,
            "today": today,
        },
    )


@login_required
@vet_required
def patient_list(request):
    qs = Pet.objects.filter(doctor=request.user)
    q = request.GET.get("q", "").strip()
    if q:
        qs = qs.filter(name__icontains=q) | qs.filter(owner_name__icontains=q)
    return render(request, "vet/patients.html", {"patients": qs.distinct(), "filter_q": q})


@login_required
@vet_required
@require_http_methods(["GET", "POST"])
def patient_create(request):
    if request.method == "POST":
        form = PetForm(request.POST)
        if form.is_valid():
            pet = form.save(commit=False)
            pet.doctor = request.user
            pet.save()
            messages.success(request, f"Patient '{pet.name}' added.")
            return redirect("patient_list")
    else:
        form = PetForm()
    return render(request, "vet/pet_form.html", {"form": form})


@login_required
@vet_required
@require_http_methods(["GET", "POST"])
def create_appointment(request):
    if not Pet.objects.filter(doctor=request.user).exists():
        messages.info(request, "Add a patient first, then you can book an appointment for them.")
        return redirect("patient_create")
    if request.method == "POST":
        form = AppointmentForm(request.POST, doctor=request.user)
        if form.is_valid():
            appt = form.save(commit=False)
            appt.doctor = request.user
            appt.status = Appointment.STATUS_PENDING
            appt.save()
            messages.success(request, "Appointment saved.")
            return redirect("share_appointment", pk=appt.pk)
    else:
        form = AppointmentForm(doctor=request.user)
    return render(request, "vet/create.html", {"form": form})


@login_required
@vet_required
def share_appointment(request, pk):
    appt = get_object_or_404(Appointment, pk=pk, doctor=request.user)
    body = share_body(request, appt)
    whatsapp_url, sms_url = build_share_urls(appt, body)
    return render(
        request,
        "vet/share.html",
        {"appointment": appt, "whatsapp_url": whatsapp_url, "sms_url": sms_url},
    )


@login_required
@vet_required
def appointment_list(request):
    qs = Appointment.objects.filter(doctor=request.user).select_related("pet")
    pet = request.GET.get("pet", "").strip()
    owner = request.GET.get("owner", "").strip()
    date = request.GET.get("date", "").strip()
    if pet:
        qs = qs.filter(pet__name__icontains=pet)
    if owner:
        qs = qs.filter(pet__owner_name__icontains=owner)
    if date:
        qs = qs.filter(date=date)
    return render(
        request,
        "vet/appointments.html",
        {
            "appointments": qs.order_by("-date", "-time", "-id"),
            "filter_pet": pet,
            "filter_owner": owner,
            "filter_date": date,
        },
    )


@login_required
@vet_required
@require_http_methods(["GET", "POST"])
def reschedule_appointment(request, pk):
    appt = get_object_or_404(Appointment, pk=pk, doctor=request.user)
    if request.method == "POST":
        form = RescheduleForm(request.POST, instance=appt)
        if form.is_valid():
            appt = form.save(commit=False)
            appt.status = Appointment.STATUS_RESCHEDULED
            appt.save()
            messages.success(request, "Time updated. Share the new details with the owner.")
            return redirect("share_appointment", pk=appt.pk)
    else:
        form = RescheduleForm(instance=appt)
    return render(request, "vet/reschedule.html", {"form": form, "appointment": appt})


@login_required
@vet_required
@require_POST
def mark_complete(request, pk):
    appt = get_object_or_404(Appointment, pk=pk, doctor=request.user)
    appt.status = Appointment.STATUS_COMPLETED
    appt.save(update_fields=["status", "updated_at"])
    messages.success(request, "Visit marked completed.")
    nxt = request.POST.get("next", "dashboard")
    if nxt == "list":
        return redirect("appointment_list")
    return redirect("dashboard")


@login_required
@vet_required
def parity_shell(request):
    """Parity-only view: renders the app_base shell with an EMPTY content block.

    Registered only when ``settings.PARITY_MODE`` is set (see appointments/urls.py),
    so it never exists in production. Its url_name ('parity_shell') matches none
    of the nav conditions in app_base.html, so NO nav item is 'active' — this
    mirrors the React shell route and lets the sidebar/shell be diffed 1:1.
    """
    return render(request, "vet/parity_shell.html")
