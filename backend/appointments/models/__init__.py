"""The app's models, grouped by domain.

They were one 583-line file, which is why opening this app told you nothing
about what it holds -- 17 models spanning auth, pets, scheduling, clinical
records, billing and messaging, in a directory named for one of them.

Splitting it changes no schema. Django keys a model by app_label and class
name, not by module path, so all 19 tables, 8 migrations and 17 content types
are exactly as they were; `makemigrations --check` proves it and runs in the
test suite (ModelPackageIntegrityTests).

Import from `appointments.models` exactly as before -- every name is
re-exported here, so no call site had to change.
"""

from .accounts import UserProfile, PasswordResetToken  # noqa: F401
from .pets import Pet  # noqa: F401
from .scheduling import Appointment  # noqa: F401
from .clinical import DiagnosticReport, TreatmentPlan, ProgressNote  # noqa: F401
from .billing import Invoice, LineItem, Payment, Package  # noqa: F401
from .notifications import Notification, NotificationPref  # noqa: F401
from .messaging import QueryThread, QueryMessage, QueryAttachment  # noqa: F401
from .enquiries import Enquiry  # noqa: F401

__all__ = [
    "UserProfile",
    "PasswordResetToken",
    "Pet",
    "Appointment",
    "DiagnosticReport",
    "TreatmentPlan",
    "ProgressNote",
    "Invoice",
    "LineItem",
    "Payment",
    "Package",
    "Notification",
    "NotificationPref",
    "QueryThread",
    "QueryMessage",
    "QueryAttachment",
    "Enquiry",
]
