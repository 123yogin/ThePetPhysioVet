"""Server-side audit trail (SRS §4).

``AuditMiddleware`` records every state-changing API request (create / update /
delete) with the acting user id and a timestamp, WITHOUT ever storing the
request body (no passwords, no PII payloads). ``record_event`` is a small helper
the auth views call to log LOGIN / LOGOUT / LOGIN_FAILED, which are not plain
CRUD on a resource.

Design notes:
- The middleware sits LAST in MIDDLEWARE, so it runs after the view and can read
  the final ``status_code`` and the authenticated ``request.user`` (DRF mirrors
  the JWT/session user back onto the Django request during view dispatch).
- Only ``POST/PUT/PATCH/DELETE`` under ``/api/v1`` with a 2xx result are logged;
  reads (GET) write nothing.
- ``/api/v1/payments/webhook`` is skipped — it is an unauthenticated external
  callback, not a doctor action.
- ``/api/v1/auth/...`` is skipped by the middleware because those events are
  recorded explicitly via ``record_event`` (LOGIN / LOGOUT / LOGIN_FAILED),
  avoiding a duplicate generic CREATE row per login.
"""

import logging

logger = logging.getLogger(__name__)

API_PREFIX = "/api/v1"
_WEBHOOK_PATH = "/api/v1/payments/webhook"
_AUTH_PREFIX = "/api/v1/auth/"

_METHOD_ACTION = {
    "POST": "CREATE",
    "PUT": "UPDATE",
    "PATCH": "UPDATE",
    "DELETE": "DELETE",
}


def _parse_entity(path):
    """Derive (entity_type, entity_id) from an ``/api/v1/...`` path.

    entity_type = the first path segment after the prefix (e.g. ``pets``);
    entity_id   = the last purely-numeric segment, if any, else None.
    """
    trimmed = path[len(API_PREFIX):].strip("/")
    if not trimmed:
        return "", None
    parts = trimmed.split("/")
    entity_type = parts[0]
    entity_id = None
    for part in parts[1:]:
        if part.isdigit():
            entity_id = part
    return entity_type, entity_id


def record_event(user, action, entity_type, entity_id=None,
                 method="", path="", status_code=0):
    """Write a single AuditLog row. Never raises to the caller.

    Used by the auth views for LOGIN / LOGOUT / LOGIN_FAILED (``user`` is None
    for a failed login). Body content is never passed in or stored.
    """
    from .models import AuditLog

    try:
        AuditLog.objects.create(
            user=user if (user is not None and getattr(user, "is_authenticated", False)) else None,
            action=action,
            entity_type=entity_type or "",
            entity_id=entity_id,
            method=method,
            path=path,
            status_code=status_code,
        )
    except Exception:  # pragma: no cover - auditing must never break the request
        logger.exception("Failed to write AuditLog for %s %s", action, entity_type)


class AuditMiddleware:
    """Logs create/update/delete on the JSON API after the view runs."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        try:
            self._maybe_log(request, response)
        except Exception:  # pragma: no cover - never break the response
            logger.exception("AuditMiddleware failed")
        return response

    def _maybe_log(self, request, response):
        method = request.method
        if method not in _METHOD_ACTION:
            return
        path = request.path
        if not path.startswith(API_PREFIX):
            return
        if path == _WEBHOOK_PATH or path.startswith(_AUTH_PREFIX):
            return
        status_code = getattr(response, "status_code", 0)
        if not (200 <= status_code < 300):
            return

        user = getattr(request, "user", None)
        entity_type, entity_id = _parse_entity(path)
        record_event(
            user=user,
            action=_METHOD_ACTION[method],
            entity_type=entity_type,
            entity_id=entity_id,
            method=method,
            path=path,
            status_code=status_code,
        )
