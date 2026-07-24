"""URL routing for the JSON API mounted at ``/api/v1/``."""

from django.urls import path

from . import (
    core,
    devices,
    owner,
    invoices,
    notification_prefs,
    notifications,
    packages,
    payments,
    queries,
    receipts,
    revenue,
)

app_name = "api"

urlpatterns = [
    # Auth
    path("auth/login", core.LoginView.as_view(), name="login"),
    path("auth/logout", core.LogoutView.as_view(), name="logout"),
    path("auth/me", core.MeView.as_view(), name="me"),
    path("auth/profile", core.ProfileView.as_view(), name="profile"),
    path("auth/signup", core.SignupView.as_view(), name="signup"),
    path("auth/refresh", core.RefreshView.as_view(), name="refresh"),
    # Owner portal (SRS §3.1 owner side)
    path("auth/owner-set-password", core.OwnerSetPasswordView.as_view(), name="owner-set-password"),
    path("owner/pets", core.OwnerPetsView.as_view(), name="owner-pets"),
    path("owner/pets/<int:pk>", core.OwnerPetDetailView.as_view(), name="owner-pet-detail"),
    # Owner appointments (SRS §3.6 owner side)
    path("owner/appointments", core.OwnerAppointmentsView.as_view(), name="owner-appointments"),
    path("owner/appointments/<int:pk>/accept", core.OwnerAppointmentAcceptView.as_view(), name="owner-appointment-accept"),
    path("owner/appointments/<int:pk>/reschedule-request", core.OwnerRescheduleRequestView.as_view(), name="owner-appointment-reschedule-request"),
    # Owner billing (SRS §3.8 owner side) — Sprint 11
    path("owner/invoices", owner.OwnerInvoiceListView.as_view(), name="owner-invoices"),
    path("owner/invoices/<int:pk>", owner.OwnerInvoiceDetailView.as_view(), name="owner-invoice-detail"),
    path("owner/invoices/<int:pk>/receipt", owner.OwnerInvoiceReceiptView.as_view(), name="owner-invoice-receipt"),
    path("owner/invoices/<int:pk>/payments", owner.OwnerInvoicePaymentView.as_view(), name="owner-invoice-payments"),
    # Owner queries (SRS §3.9 owner side) — Sprint 11
    path("owner/pets/<int:pet_pk>/queries", owner.OwnerPetQueryThreadView.as_view(), name="owner-pet-queries"),
    # Doctor approve/reject an owner's reschedule request
    path("appointments/<int:pk>/reschedule-approve", core.AppointmentRescheduleApproveView.as_view(), name="appointment-reschedule-approve"),
    path("appointments/<int:pk>/reschedule-reject", core.AppointmentRescheduleRejectView.as_view(), name="appointment-reschedule-reject"),
    # Dashboard
    path("dashboard/stats", core.DashboardStatsView.as_view(), name="dashboard-stats"),
    # Appointments
    path("appointments", core.AppointmentListCreateView.as_view(), name="appointments"),
    path("appointments/<int:pk>", core.AppointmentDetailView.as_view(), name="appointment-detail"),
    path(
        "appointments/<int:pk>/reschedule",
        core.AppointmentRescheduleView.as_view(),
        name="appointment-reschedule",
    ),
    path(
        "appointments/<int:pk>/complete",
        core.AppointmentCompleteView.as_view(),
        name="appointment-complete",
    ),
    path(
        "appointments/<int:pk>/share",
        core.AppointmentShareView.as_view(),
        name="appointment-share",
    ),
    # Pets
    path("pets", core.PetListCreateView.as_view(), name="pets"),
    path("pets/<int:pk>", core.PetDetailView.as_view(), name="pet-detail"),
    # Diagnostic reports (SRS §3.4)
    path(
        "pets/<int:pet_pk>/diagnoses",
        core.PetDiagnosisListCreateView.as_view(),
        name="pet-diagnoses",
    ),
    path(
        "diagnoses/<int:pk>",
        core.DiagnosisDetailView.as_view(),
        name="diagnosis-detail",
    ),
    path(
        "diagnoses/<int:pk>/file",
        core.DiagnosisReplaceFileView.as_view(),
        name="diagnosis-file",
    ),
    # Treatment plans + progress notes (SRS §3.5)
    path(
        "pets/<int:pet_pk>/treatment-plans",
        core.PetTreatmentPlanListCreateView.as_view(),
        name="pet-treatment-plans",
    ),
    path(
        "treatment-plans/<int:pk>",
        core.TreatmentPlanDetailView.as_view(),
        name="treatment-plan-detail",
    ),
    path(
        "treatment-plans/<int:pk>/progress-notes",
        core.TreatmentPlanProgressNoteListCreateView.as_view(),
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
        invoices.InvoiceListCreateView.as_view(),
        name="invoices",
    ),
    path(
        "invoices/<int:pk>",
        invoices.InvoiceDetailView.as_view(),
        name="invoice-detail",
    ),
    path(
        "invoices/<int:pk>/receipt",
        receipts.InvoiceReceiptView.as_view(),
        name="invoice-receipt",
    ),
    path(
        "pets/<int:pet_pk>/invoices",
        invoices.PetInvoiceListView.as_view(),
        name="pet-invoices",
    ),
    # Payments
    path(
        "invoices/<int:pk>/razorpay-order",
        payments.InvoiceRazorpayOrderView.as_view(),
        name="invoice-razorpay-order",
    ),
    path(
        "invoices/<int:pk>/payments",
        payments.InvoicePaymentCreateView.as_view(),
        name="invoice-payments",
    ),
    path(
        "payments/webhook",
        payments.RazorpayWebhookView.as_view(),
        name="payments-webhook",
    ),
    # Packages — live prepaid-session counter (US-PAY-04).
    path(
        "packages/<int:pk>",
        packages.PackageDetailView.as_view(),
        name="package-detail",
    ),
    # Revenue dashboard
    path(
        "revenue",
        revenue.RevenueSummaryView.as_view(),
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
        notifications.NotificationListView.as_view(),
        name="notifications",
    ),
    path(
        "notifications/unread-count",
        notifications.NotificationUnreadCountView.as_view(),
        name="notifications-unread-count",
    ),
    path(
        "notifications/mark-all-read",
        notifications.NotificationMarkAllReadView.as_view(),
        name="notifications-mark-all-read",
    ),
    path(
        "notifications/<int:pk>/read",
        notifications.NotificationMarkReadView.as_view(),
        name="notification-read",
    ),
    # SMS opt-out preference (keyed by owner phone). Path is
    # ``notification-prefs`` to match the SPA client contract
    # (clients/web/src/api/notifications.ts calls ``/notification-prefs``).
    # Distinct from the ``notifications/<int:pk>/read`` /
    # ``notifications/unread-count`` feed routes.
    path(
        "notification-prefs",
        notification_prefs.NotificationPrefView.as_view(),
        name="notification-prefs",
    ),
    # FCM web-push device registration (the doctor's browser)
    path(
        "devices",
        devices.DeviceTokenView.as_view(),
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
        queries.QueryInboxView.as_view(),
        name="queries-inbox",
    ),
    path(
        "pets/<int:pet_pk>/queries",
        queries.PetQueryThreadView.as_view(),
        name="pet-queries",
    ),
]
