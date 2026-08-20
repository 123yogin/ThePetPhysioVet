from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import (
    UserProfile, Pet, Appointment, DiagnosticReport,
    TreatmentPlan, ProgressNote, Invoice, LineItem, Payment, Package,
    Notification, NotificationPref, QueryThread, QueryMessage, QueryAttachment,
)

@admin.register(UserProfile)
class UserProfileAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        ("Clinic Information", {"fields": ("role", "clinic_name", "clinic_address", "clinic_phone", "phone")}),
    )

admin.site.register(Pet)
admin.site.register(Appointment)
admin.site.register(DiagnosticReport)
admin.site.register(TreatmentPlan)
admin.site.register(ProgressNote)
admin.site.register(Invoice)
admin.site.register(LineItem)
admin.site.register(Payment)
admin.site.register(Package)
admin.site.register(Notification)
admin.site.register(NotificationPref)
admin.site.register(QueryThread)
admin.site.register(QueryMessage)
admin.site.register(QueryAttachment)
