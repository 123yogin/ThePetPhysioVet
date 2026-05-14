from django.contrib import admin

from .models import Appointment, DoctorProfile


@admin.register(DoctorProfile)
class DoctorProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "clinic_name", "clinic_phone")
    search_fields = ("user__username", "user__email", "clinic_name")


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = ("pet_name", "owner_name", "visit_type", "date", "time", "status", "doctor")
    list_filter = ("status", "date")
    search_fields = ("pet_name", "owner_name", "owner_phone")
    raw_id_fields = ("doctor",)
