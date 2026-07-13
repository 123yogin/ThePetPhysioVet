from django.contrib import admin

from .models import Appointment, DoctorProfile, Pet


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
