from django.urls import path

from .views import (
    # Auth
    current_user_view, login_view, signup_view, logout_view, update_profile_view,
    refresh_view,
    # Dashboard
    dashboard_stats_view,
    # Pets
    pets_view, pet_detail_view,
    # Diagnostic reports
    pet_diagnoses_view, diagnostic_report_detail_view,
    # Treatment plans
    pet_treatment_plans_view, treatment_plan_detail_view, treatment_plan_progress_notes_view,
    # Appointments
    appointments_view, appointment_detail_view, appointment_reschedule_view,
    appointment_complete_view, appointment_reschedule_approve_view,
    appointment_reschedule_reject_view, appointment_share_view,
    appointment_confirm_view, appointment_options_view,
    # Billing
    invoices_view, invoice_detail_view, invoice_payments_view, revenue_view,
    # Notifications
    notifications_view, notifications_mark_all_read_view, notification_prefs_view,
    # Queries
    queries_inbox_view, pet_queries_view,
    # Owner portal
    owner_pets_view, owner_pet_detail_view, owner_pet_diagnoses_view, owner_pet_history_view,
    owner_appointments_view, owner_appointment_accept_view, owner_appointment_reschedule_request_view,
    owner_appointment_cancel_view, owner_invoices_view, owner_invoice_detail_view,
    owner_pet_queries_view,
)

# NOTE: no trailing slashes on any path — the SPA (frontend/src/lib/http.ts)
# calls these endpoints without a trailing slash (e.g. `/pets/1/diagnoses`),
# and APPEND_SLASH redirects would break POST bodies. Paths here match
# docs/API_CONTRACT.md §3 verbatim.
urlpatterns = [
    # --- Auth ---
    path("auth/me", current_user_view, name="auth-me"),
    path("auth/login", login_view, name="auth-login"),
    path("auth/signup", signup_view, name="auth-signup"),
    path("auth/logout", logout_view, name="auth-logout"),
    path("auth/profile", update_profile_view, name="auth-profile"),
    path("auth/refresh", refresh_view, name="auth-refresh"),

    # --- Dashboard ---
    path("dashboard/stats", dashboard_stats_view, name="dashboard-stats"),

    # --- Pets ---
    path("pets", pets_view, name="pets"),
    path("pets/<int:pk>", pet_detail_view, name="pet-detail"),
    path("pets/<int:pk>/diagnoses", pet_diagnoses_view, name="pet-diagnoses"),
    path("pets/<int:pk>/treatment-plans", pet_treatment_plans_view, name="pet-treatment-plans"),
    path("pets/<int:pk>/queries", pet_queries_view, name="pet-queries"),

    # --- Diagnostic reports ---
    path("diagnoses/<int:pk>", diagnostic_report_detail_view, name="diagnosis-detail"),

    # --- Treatment plans ---
    path("treatment-plans/<int:pk>", treatment_plan_detail_view, name="treatment-plan-detail"),
    path(
        "treatment-plans/<int:pk>/progress-notes",
        treatment_plan_progress_notes_view,
        name="treatment-plan-progress-notes",
    ),

    # --- Appointments ---
    path("appointments", appointments_view, name="appointments"),
    path("appointments/<int:pk>", appointment_detail_view, name="appointment-detail"),
    path("appointments/<int:pk>/reschedule", appointment_reschedule_view, name="appointment-reschedule"),
    path("appointments/<int:pk>/complete", appointment_complete_view, name="appointment-complete"),
    path(
        "appointments/<int:pk>/reschedule-approve",
        appointment_reschedule_approve_view,
        name="appointment-reschedule-approve",
    ),
    path(
        "appointments/<int:pk>/reschedule-reject",
        appointment_reschedule_reject_view,
        name="appointment-reschedule-reject",
    ),
    path("appointments/<int:pk>/share", appointment_share_view, name="appointment-share"),
    path("appointments/<int:pk>/confirm", appointment_confirm_view, name="appointment-confirm"),
    path("appointment-options", appointment_options_view, name="appointment-options"),

    # --- Billing ---
    path("invoices", invoices_view, name="invoices"),
    path("invoices/<int:pk>", invoice_detail_view, name="invoice-detail"),
    path("invoices/<int:pk>/payments", invoice_payments_view, name="invoice-payments"),
    path("revenue", revenue_view, name="revenue"),

    # --- Notifications ---
    path("notifications", notifications_view, name="notifications"),
    path("notifications/mark-all-read", notifications_mark_all_read_view, name="notifications-mark-all-read"),
    path("notification-prefs", notification_prefs_view, name="notification-prefs"),

    # --- Queries ---
    path("queries/inbox", queries_inbox_view, name="queries-inbox"),

    # --- Owner portal ---
    path("owner/pets", owner_pets_view, name="owner-pets"),
    path("owner/pets/<int:pk>", owner_pet_detail_view, name="owner-pet-detail"),
    path("owner/pets/<int:pk>/diagnoses", owner_pet_diagnoses_view, name="owner-pet-diagnoses"),
    path("owner/pets/<int:pk>/history", owner_pet_history_view, name="owner-pet-history"),
    path("owner/pets/<int:pk>/queries", owner_pet_queries_view, name="owner-pet-queries"),
    path("owner/appointments", owner_appointments_view, name="owner-appointments"),
    path(
        "owner/appointments/<int:pk>/accept",
        owner_appointment_accept_view,
        name="owner-appointment-accept",
    ),
    path(
        "owner/appointments/<int:pk>/reschedule-request",
        owner_appointment_reschedule_request_view,
        name="owner-appointment-reschedule-request",
    ),
    path(
        "owner/appointments/<int:pk>/cancel",
        owner_appointment_cancel_view,
        name="owner-appointment-cancel",
    ),
    path("owner/invoices", owner_invoices_view, name="owner-invoices"),
    path("owner/invoices/<int:pk>", owner_invoice_detail_view, name="owner-invoice-detail"),
]
