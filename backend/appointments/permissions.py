"""Reusable DRF permission classes.

CLAUDE.md rule 4 / API_CONTRACT.md §4: the gateway/JWT only proves *who* the
caller is — every service (view) must still re-check role and object
ownership itself. These classes are the building blocks views.py uses to do
that.
"""

from rest_framework import permissions
from rest_framework.exceptions import NotFound


class IsDoctor(permissions.BasePermission):
    """Allows access only to authenticated users with role == DOCTOR."""

    message = "This action requires a doctor account."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, "role", None) == "DOCTOR")


class IsOwner(permissions.BasePermission):
    """Allows access only to authenticated users with role == OWNER."""

    message = "This action requires a pet owner account."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, "role", None) == "OWNER")


def _resolve_owning_user(obj):
    """Best-effort resolution of "who owns this record" for common shapes:

    - the object itself has an `owner` FK (Pet, Invoice)
    - the object has a `pet` FK whose `owner` FK is the owning user
      (DiagnosticReport, TreatmentPlan, Appointment, QueryThread)
    - the object has a `thread.pet.owner` (QueryMessage)
    """
    owner = getattr(obj, "owner", None)
    if owner is not None:
        return owner

    pet = getattr(obj, "pet", None)
    if pet is not None:
        return getattr(pet, "owner", None)

    thread = getattr(obj, "thread", None)
    if thread is not None:
        return _resolve_owning_user(thread)

    plan = getattr(obj, "plan", None)
    if plan is not None:
        return _resolve_owning_user(plan)

    return None


class IsObjectOwner(permissions.BasePermission):
    """Object-level ownership check for owner-portal endpoints.

    Per API_CONTRACT.md §4.3: an owner requesting another owner's record must
    get a 404, not a 403, so existence isn't leaked. DRF permission classes
    are allowed to raise exceptions directly instead of returning a bool, so
    we raise `NotFound` on mismatch rather than returning False (which would
    surface as a 403 via `permission_denied`).
    """

    def has_object_permission(self, request, view, obj):
        user = request.user
        owning_user = _resolve_owning_user(obj)
        if owning_user is None or owning_user.pk != user.pk:
            raise NotFound()
        return True
