"""SMS opt-out preference endpoint (SRS §3.7 AC-03, US-NOTIF-07).

Read/set surface for the per-owner SMS opt-out preference. Preferences are keyed
by *owner phone* because pet owners are free-text on ``Pet`` today (not Users) —
see :class:`appointments.models.NotificationPref`.

The route -> view-class contract is frozen in ``api_urls.py``; this module owns
only the view bodies below (it must not edit ``api_urls.py`` / models / settings).

Enforcement of the preference is NOT here: the delivery dispatcher
(``appointments/delivery/dispatch.py``) is the single delivery path and consults
the ``NotificationPref`` row centrally before every SMS, writing a
``SKIPPED_OPTED_OUT`` DeliveryLog when opted out. This endpoint just reads and
sets the row, so a change takes effect on the next dispatch (AC-05).
"""

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .core import IsVet
from ..models import NotificationPref
from ..serializers.notifications import NotificationPrefSerializer

# JSON booleans arrive as real ``bool``; form-encoded / query values arrive as
# strings — accept the common truthy/falsey spellings for robustness.
_TRUE = {"true", "1", "yes", "on"}
_FALSE = {"false", "0", "no", "off", ""}


def _coerce_bool(value):
    """Coerce a request value to ``bool``; return ``None`` if unparseable/missing."""
    if isinstance(value, bool):
        return value
    if value is None:
        return None
    text = str(value).strip().lower()
    if text in _TRUE:
        return True
    if text in _FALSE:
        return False
    return None


class NotificationPrefView(APIView):
    """Read / set the SMS opt-out preference for an owner phone."""

    permission_classes = [IsVet]

    def get(self, request):
        owner_phone = (request.query_params.get("owner_phone") or "").strip()
        if not owner_phone:
            return Response(
                {"owner_phone": ["This query parameter is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        pref = NotificationPref.objects.filter(owner_phone=owner_phone).first()
        # Owners are opted-in by default: no row => sms_opt_out is False.
        return Response(
            {
                "owner_phone": owner_phone,
                "sms_opt_out": pref.sms_opt_out if pref is not None else False,
            }
        )

    def put(self, request):
        return self._set(request)

    # PATCH behaves identically — the whole preference is a single flag.
    def patch(self, request):
        return self._set(request)

    # POST is the SPA client's save verb (useSetNotificationPref in
    # clients/web/src/api/notifications.ts). It upserts the single flag, same
    # as PUT/PATCH.
    def post(self, request):
        return self._set(request)

    def _set(self, request):
        owner_phone = (request.data.get("owner_phone") or "").strip()
        if not owner_phone:
            return Response(
                {"owner_phone": ["This field is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        sms_opt_out = _coerce_bool(request.data.get("sms_opt_out"))
        if sms_opt_out is None:
            return Response(
                {"sms_opt_out": ["A boolean value is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        pref, _created = NotificationPref.objects.update_or_create(
            owner_phone=owner_phone,
            defaults={"sms_opt_out": sms_opt_out},
        )
        return Response(NotificationPrefSerializer(pref).data)
