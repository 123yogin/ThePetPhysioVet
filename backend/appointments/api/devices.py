"""FCM web-push device-token registration (SRS §3.7).

The route -> view-class contract is frozen in ``api_urls.py`` (``POST/DELETE
/api/v1/devices``); the ``DeviceToken`` model is provided by the foundation.

``POST`` registers (or refreshes) the FCM registration token the doctor's
browser obtained, scoped to ``request.user`` (IsVet). ``DELETE`` unregisters a
token on sign-out / push-permission revocation. The FCM channel
(``delivery/fcm.py``) targets these tokens when pushing to the doctor.
"""

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .core import IsVet
from ..models import DeviceToken


class DeviceTokenView(APIView):
    """Register / unregister the doctor's FCM web-push token."""

    permission_classes = [IsVet]

    def post(self, request):
        token = (request.data.get("token") or "").strip()
        if not token:
            return Response(
                {"token": ["This field is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        platform = (request.data.get("platform") or "web").strip() or "web"

        # get_or_create makes registration idempotent: a browser re-posting the
        # same token yields one row, not duplicates. ``token`` is globally
        # unique, so a token is bound to exactly one doctor at a time.
        obj, created = DeviceToken.objects.get_or_create(
            token=token,
            defaults={"user": request.user, "platform": platform},
        )
        if not created:
            # Refresh: re-bind to the caller (a browser can re-register under a
            # new login) and bump ``last_seen`` (auto_now) + platform.
            obj.user = request.user
            obj.platform = platform
            obj.save(update_fields=["user", "platform", "last_seen"])

        return Response(
            {
                "id": obj.id,
                "token": obj.token,
                "platform": obj.platform,
                "created": created,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def delete(self, request):
        token = (request.data.get("token") or "").strip()
        if not token:
            return Response(
                {"token": ["This field is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Scope the delete to the caller's own tokens (AuthZ in depth): a doctor
        # cannot unregister another doctor's device.
        deleted, _ = DeviceToken.objects.filter(
            user=request.user, token=token
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
