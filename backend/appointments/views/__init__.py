"""API views for the Pet Physio Vet backend.

Implements API_CONTRACT.md §3 exactly: doctor-facing routes (top level) and
owner-portal routes (`/owner/*`). See §4 for the authZ rules enforced here:

- Default permission is IsAuthenticated; AllowAny only on /auth/login and
  /auth/signup.
- Doctor routes require role == DOCTOR (`IsDoctor`).
- Owner routes require role == OWNER (`IsOwner`) *and* re-verify object
  ownership in the view via `IsObjectOwner` (raises 404, never 403, so a
  cross-owner request can't be used to probe for existence).
- No anonymous fallback user anywhere.

This was a single 1674-line module. It is now a package of domain modules;
the routing in urls.py, `from .views import ...` in serializers.py and the
`dir(views)` permission audit in test_authz.py are all unaffected because
every name is re-exported below.

Module boundaries came from the helper-usage graph rather than taste: a
helper used by more than one domain is in _shared.py, one used by a single
domain sits with it.
"""

from ._shared import (  # noqa: F401
    problem,
    _first_error_detail,
    _doctor_scoped,
    _rate_limited,
    _client_ip,
    _unique_owner_username,
)
from .auth import (  # noqa: F401
    _issue_tokens,
    current_user_view,
    login_view,
    signup_view,
    logout_view,
    refresh_view,
    PASSWORD_RESET_WINDOW_SECONDS,
    PASSWORD_RESET_EMAIL_LIMIT,
    PASSWORD_RESET_IP_LIMIT,
    _issue_password_reset,
    password_reset_request_view,
    password_reset_confirm_view,
    update_profile_view,
)
from .dashboard import (  # noqa: F401
    dashboard_stats_view,
)
from .pets import (  # noqa: F401
    pets_view,
    pet_detail_view,
)
from .clinical import (  # noqa: F401
    pet_diagnoses_view,
    diagnostic_report_detail_view,
    pet_treatment_plans_view,
    treatment_plan_detail_view,
    treatment_plan_progress_notes_view,
)
from .scheduling import (  # noqa: F401
    appointments_view,
    appointment_detail_view,
    appointment_reschedule_view,
    appointment_complete_view,
    appointment_confirm_view,
    appointment_reschedule_approve_view,
    appointment_reschedule_reject_view,
    appointment_share_view,
    appointment_options_view,
)
from .billing import (  # noqa: F401
    invoices_view,
    invoice_detail_view,
    invoice_payments_view,
    revenue_view,
)
from .notifications import (  # noqa: F401
    notifications_view,
    notifications_mark_all_read_view,
    notification_prefs_view,
)
from .messaging import (  # noqa: F401
    MAX_QUERY_ATTACHMENTS,
    _create_query_message,
    _empty_thread_payload,
    queries_inbox_view,
    pet_queries_view,
    owner_pet_queries_view,
)
from .owner import (  # noqa: F401
    owner_pets_view,
    owner_pet_detail_view,
    owner_pet_diagnoses_view,
    owner_pet_history_view,
    owner_appointments_view,
    owner_appointment_accept_view,
    owner_appointment_reschedule_request_view,
    owner_appointment_cancel_view,
    owner_invoices_view,
    owner_invoice_detail_view,
)
from .enquiries import (  # noqa: F401
    ENQUIRY_WINDOW_SECONDS,
    ENQUIRY_IP_LIMIT,
    ENQUIRY_EMAIL_LIMIT,
    _guess_species,
    _enquiry_create,
    _enquiries_list,
    enquiries_view,
    enquiry_convert_view,
    enquiry_dismiss_view,
)

__all__ = [
    "problem",
    "current_user_view",
    "login_view",
    "signup_view",
    "logout_view",
    "refresh_view",
    "PASSWORD_RESET_WINDOW_SECONDS",
    "PASSWORD_RESET_EMAIL_LIMIT",
    "PASSWORD_RESET_IP_LIMIT",
    "password_reset_request_view",
    "password_reset_confirm_view",
    "update_profile_view",
    "dashboard_stats_view",
    "pets_view",
    "pet_detail_view",
    "pet_diagnoses_view",
    "diagnostic_report_detail_view",
    "pet_treatment_plans_view",
    "treatment_plan_detail_view",
    "treatment_plan_progress_notes_view",
    "appointments_view",
    "appointment_detail_view",
    "appointment_reschedule_view",
    "appointment_complete_view",
    "appointment_confirm_view",
    "appointment_reschedule_approve_view",
    "appointment_reschedule_reject_view",
    "appointment_share_view",
    "appointment_options_view",
    "invoices_view",
    "invoice_detail_view",
    "invoice_payments_view",
    "revenue_view",
    "notifications_view",
    "notifications_mark_all_read_view",
    "notification_prefs_view",
    "MAX_QUERY_ATTACHMENTS",
    "queries_inbox_view",
    "pet_queries_view",
    "owner_pet_queries_view",
    "owner_pets_view",
    "owner_pet_detail_view",
    "owner_pet_diagnoses_view",
    "owner_pet_history_view",
    "owner_appointments_view",
    "owner_appointment_accept_view",
    "owner_appointment_reschedule_request_view",
    "owner_appointment_cancel_view",
    "owner_invoices_view",
    "owner_invoice_detail_view",
    "ENQUIRY_WINDOW_SECONDS",
    "ENQUIRY_IP_LIMIT",
    "ENQUIRY_EMAIL_LIMIT",
    "enquiries_view",
    "enquiry_convert_view",
    "enquiry_dismiss_view",
]
