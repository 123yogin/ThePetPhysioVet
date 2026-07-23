"""Custom DRF authentication for the doctor SPA.

Auth-hardening sprint (SRS §3.1 + §4): the API now authenticates a
short-lived JWT **access** token (``JWTAccessAuthentication``) FIRST, then
falls back to the existing Django session + CSRF stack
(``CsrfSessionAuthentication``) so the template pages and the existing
``client.login()`` tests keep working. See docs/adr/0001-drf-session-auth.md
for the original session decision.
"""

from rest_framework.authentication import SessionAuthentication
from rest_framework_simplejwt.authentication import JWTAuthentication


class JWTAccessAuthentication(JWTAuthentication):
    """Bearer access-token auth for the SPA.

    Subclasses SimpleJWT's ``JWTAuthentication`` only to advertise a
    ``Bearer`` challenge. A missing token returns ``None`` (DRF then tries the
    next authenticator — session); a present-but-invalid/expired token raises
    ``AuthenticationFailed`` -> 401. On success ``request.auth`` is the
    validated token (a mapping of verified claims, incl. ``role``), which
    ``IsVet`` reads for RBAC — never trust ``request.data`` for role.
    """

    def authenticate_header(self, request):
        return "Bearer"


class CsrfSessionAuthentication(SessionAuthentication):
    """Session auth that returns 401 (not DRF's default 403) for anonymous
    requests, so the React ``RequireAuth`` guard can redirect to /login.

    CSRF is still enforced for authenticated unsafe requests (inherited from
    ``SessionAuthentication``); the SPA sends ``X-CSRFToken``.
    """

    def authenticate_header(self, request):
        return "Session"
