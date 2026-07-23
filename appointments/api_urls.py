"""URL routing for the JSON API mounted at ``/api/v1/``."""

from django.urls import path

from . import (
    api,
    api_devices,
    api_invoices,
    api_notification_prefs,
    api_notifications,
    api_packages,
    api_payments,
    api_queries,
    api_receipts,
    api_revenue,
)

app_name = "api"

urlpatterns = [
    # Auth
    path("auth/login", api.LoginView.as_view(), name="login"),
    path("auth/logout", api.LogoutView.as_view(), name="logout"),
    path("auth/me", api.MeView.as_view(), name="me"),
    path("auth/signup", api.SignupView.as_view(), name="signup"),
    path("auth/refresh", api.RefreshView.as_view(), name="refresh"),
    # Dashboard
    path("dashboard/stats", api.DashboardStatsView.as_view(), name="dashboard-stats"),
    # Appointments
    path("appointments", api.AppointmentListCreateView.as_view(), name="appointments"),
    path("appointments/<int:pk>", api.AppointmentDetailView.as_view(), name="appointment-detail"),
    path(
        "appointments/<int:pk>/reschedule",
        api.AppointmentRescheduleView.as_view(),
        name="appointment-reschedule",
    ),
    path(
        "appointments/<int:pk>/complete",
        api.AppointmentCompleteView.as_view(),
        name="appointment-complete",
    ),
    path(
        "appointments/<int:pk>/share",
        api.AppointmentShareView.as_view(),
        name="appointment-share",
    ),
    # Pets
    path("pets", api.PetListCreateView.as_view(), name="pets"),
    path("pets/<int:pk>", api.PetDetailView.as_view(), name="pet-detail"),
    # Diagnostic reports (SRS §3.4)
    path(
        "pets/<int:pet_pk>/diagnoses",
        api.PetDiagnosisListCreateView.as_view(),
        name="pet-diagnoses",
    ),
    path(
        "diagnoses/<int:pk>",
        api.DiagnosisDetailView.as_view(),
        name="diagnosis-detail",
    ),
    path(
        "diagnoses/<int:pk>/file",
        api.DiagnosisReplaceFileView.as_view(),
        name="diagnosis-file",
    ),
    # Treatment plans + progress notes (SRS §3.5)
    path(
        "pets/<int:pet_pk>/treatment-plans",
        api.PetTreatmentPlanListCreateView.as_view(),
        name="pet-treatment-plans",
    ),
    path(
        "treatment-plans/<int:pk>",
        api.TreatmentPlanDetailView.as_view(),
        name="treatment-plan-detail",
    ),
    path(
        "treatment-plans/<int:pk>/progress-notes",
        api.TreatmentPlanProgressNoteListCreateView.as_view(),
        name="treatment-plan-progress-notes",
    ),
    # -------------------------------------------------------------------
    # Payments & billing (SRS §3.8) — Sprint 4.
    # Routes are frozen here by the Backend foundation; fan-out tasks fill in
    # the referenced view bodies and never edit this shared file.
    # -------------------------------------------------------------------
    # Invoices
    path(
        "invoices",
        api_invoices.InvoiceListCreateView.as_view(),
        name="invoices",
    ),
    path(
        "invoices/<int:pk>",
        api_invoices.InvoiceDetailView.as_view(),
        name="invoice-detail",
    ),
    path(
        "invoices/<int:pk>/receipt",
        api_receipts.InvoiceReceiptView.as_view(),
        name="invoice-receipt",
    ),
    path(
        "pets/<int:pet_pk>/invoices",
        api_invoices.PetInvoiceListView.as_view(),
        name="pet-invoices",
    ),
    # Payments
    path(
        "invoices/<int:pk>/razorpay-order",
        api_payments.InvoiceRazorpayOrderView.as_view(),
        name="invoice-razorpay-order",
    ),
    path(
        "invoices/<int:pk>/payments",
        api_payments.InvoicePaymentCreateView.as_view(),
        name="invoice-payments",
    ),
    path(
        "payments/webhook",
        api_payments.RazorpayWebhookView.as_view(),
        name="payments-webhook",
    ),
    # Packages — live prepaid-session counter (US-PAY-04).
    path(
        "packages/<int:pk>",
        api_packages.PackageDetailView.as_view(),
        name="package-detail",
    ),
    # Revenue dashboard
    path(
        "revenue",
        api_revenue.RevenueSummaryView.as_view(),
        name="revenue",
    ),
    # -------------------------------------------------------------------
    # Notifications & reminders (SRS §3.7, §7) — Sprint 5.
    # Routes are frozen here by the Backend foundation; fan-out tasks fill in
    # the referenced view bodies and never edit this shared file.
    # -------------------------------------------------------------------
    # Notification feed + unread badge (dashboard)
    path(
        "notifications",
        api_notifications.NotificationListView.as_view(),
        name="notifications",
    ),
    path(
        "notifications/unread-count",
        api_notifications.NotificationUnreadCountView.as_view(),
        name="notifications-unread-count",
    ),
    path(
        "notifications/mark-all-read",
        api_notifications.NotificationMarkAllReadView.as_view(),
        name="notifications-mark-all-read",
    ),
    path(
        "notifications/<int:pk>/read",
        api_notifications.NotificationMarkReadView.as_view(),
        name="notification-read",
    ),
    # SMS opt-out preference (keyed by owner phone). Path is
    # ``notification-prefs`` to match the SPA client contract
    # (clients/web/src/api/notifications.ts calls ``/notification-prefs``).
    # Distinct from the ``notifications/<int:pk>/read`` /
    # ``notifications/unread-count`` feed routes.
    path(
        "notification-prefs",
        api_notification_prefs.NotificationPrefView.as_view(),
        name="notification-prefs",
    ),
    # FCM web-push device registration (the doctor's browser)
    path(
        "devices",
        api_devices.DeviceTokenView.as_view(),
        name="devices",
    ),
    # -------------------------------------------------------------------
    # Owner <-> Doctor queries (SRS §3.9) — Sprint 7.
    # Routes are frozen here by the Backend foundation; fan-out tasks fill in
    # the referenced view bodies and never edit this shared file.
    # ``queries/inbox`` is a static path so it cannot collide with the
    # pet-scoped thread route (no ``<id>`` detail route exists). Append-only:
    # the thread route accepts only GET/POST; PUT/PATCH/DELETE -> 405.
    # -------------------------------------------------------------------
    path(
        "queries/inbox",
        api_queries.QueryInboxView.as_view(),
        name="queries-inbox",
    ),
    path(
        "pets/<int:pet_pk>/queries",
        api_queries.PetQueryThreadView.as_view(),
        name="pet-queries",
    ),
]
