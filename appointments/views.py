from functools import wraps
from urllib.parse import quote

from django.conf import settings
from django.contrib import messages
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_http_methods, require_POST

from .forms import AppointmentForm, DoctorLoginForm, DoctorSignupForm, PetForm, RescheduleForm
from .models import Appointment, DoctorProfile, Pet


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


def _share_body(request, appt: Appointment) -> str:
    profile = request.user.doctor_profile
    doctor_name = appt.doctor.get_full_name().strip() or appt.doctor.get_username()
    clinic = (profile.clinic_name or "").strip() or getattr(
        settings, "DEFAULT_CLINIC_NAME", "Veterinary Clinic"
    )
    addr = (profile.clinic_address or "").strip() or getattr(settings, "DEFAULT_CLINIC_ADDRESS", "")
    clinic_phone = (profile.clinic_phone or "").strip()
    visit_line = appt.get_visit_type_display()
    if appt.visit_type == Appointment.VISIT_CLINIC:
        visit_detail = "Please come to the clinic at the address below."
    else:
        visit_detail = "Home visit — the veterinarian will come to you. Confirm the address by reply if needed."

    lines = [
        f"Hello {appt.owner_name},",
        "",
        f"Pet: {appt.pet_name} ({appt.pet_type})",
        f"Visit type: {visit_line}",
        visit_detail,
        f"Appointment: {appt.date} at {appt.time}",
        f"Doctor: Dr. {doctor_name}",
        f"Clinic: {clinic}",
    ]
    if addr:
        lines.append(f"Clinic address: {addr}")
    if clinic_phone:
        lines.append(f"Clinic phone: {clinic_phone}")
    if appt.reason_notes.strip():
        lines.extend(["", "Notes:", appt.reason_notes.strip()])
    lines.extend(["", "— Sent via ThePetPhysioVet"])
    return "\n".join(lines)


@login_required
@vet_required
def dashboard(request):
    today = timezone.localdate()
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
    body = _share_body(request, appt)
    encoded = quote(body, safe="")
    digits = "".join(c for c in appt.owner_phone if c.isdigit())
    if len(digits) >= 8:
        whatsapp_url = f"https://wa.me/{digits}?text={encoded}"
    else:
        whatsapp_url = f"https://wa.me/?text={encoded}"
    sms_target = appt.owner_phone.strip() or digits
    sms_url = f"sms:{sms_target}?body={quote(body)}" if sms_target else "#"
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
            "appointments": qs.order_by("-date", "-time"),
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
