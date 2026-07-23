from django.contrib import admin

from .models import (
    Appointment,
    Diagnosis,
    DoctorProfile,
    Pet,
    ProgressNote,
    TreatmentPlan,
)


@admin.register(DoctorProfile)
class DoctorProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "clinic_name", "clinic_phone")
    search_fields = ("user__username", "user__email", "clinic_name")


@admin.register(Pet)
class PetAdmin(admin.ModelAdmin):
    list_display = ("name", "pet_type", "owner_name", "owner_phone", "doctor")
    list_filter = ("pet_type",)
    search_fields = ("name", "owner_name", "owner_phone")
    raw_id_fields = ("doctor",)


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = ("pet", "visit_type", "date", "time", "status", "doctor")
    list_filter = ("status", "date")
    search_fields = ("pet__name", "pet__owner_name", "pet__owner_phone")
    raw_id_fields = ("doctor", "pet")


@admin.register(Diagnosis)
class DiagnosisAdmin(admin.ModelAdmin):
    list_display = ("pet", "report_type", "original_filename", "size", "uploaded_at", "doctor")
    list_filter = ("report_type",)
    search_fields = ("pet__name", "original_filename")
    raw_id_fields = ("doctor", "pet")


class ProgressNoteInline(admin.TabularInline):
    model = ProgressNote
    extra = 0


@admin.register(TreatmentPlan)
class TreatmentPlanAdmin(admin.ModelAdmin):
    list_display = ("pet", "frequency", "duration", "status", "start_date", "end_date", "doctor")
    list_filter = ("status", "frequency", "duration")
    search_fields = ("pet__name",)
    raw_id_fields = ("doctor", "pet")
    inlines = [ProgressNoteInline]


@admin.register(ProgressNote)
class ProgressNoteAdmin(admin.ModelAdmin):
    list_display = ("plan", "session_no", "created_at")
    raw_id_fields = ("plan",)
