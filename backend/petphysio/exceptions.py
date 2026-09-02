"""Project-wide DRF exception handler producing RFC-7807 problem+json.

Closes CLAUDE.md open debt item 3 ("RFC-7807 error shape is partial"). Before
this, only hand-rolled errors used `problem()`; everything DRF raised itself
came back in its own shape, which caused two user-visible faults:

1. **Validation errors had no `detail`.** DRF returns `{"field": ["msg"]}` for
   a serializer failure. `frontend/src/lib/http.ts` reads
   `detail || message || statusText`, so with no `detail` it fell through to the
   HTTP status text and a clinician saw the literal words "Bad Request" with no
   indication of which field was wrong.

2. **404s leaked Django's internals.** `get_object_or_404` produces
   "No Pet matches the given query." — the ORM's phrasing and the model's name,
   shown to a pet owner. Measured live before this change.

Both now come out as problem+json with a human `detail`.

Note on 404s specifically: the message is deliberately identical whether the
object does not exist or merely is not yours. Object-level permission checks in
this codebase raise `NotFound` rather than `PermissionDenied` precisely so that
cross-tenant probing cannot distinguish the two (CLAUDE.md rule 4), and a
differently-worded body would hand that distinction straight back.
"""

from rest_framework.views import exception_handler as drf_exception_handler

# Human-readable stand-ins for the messages DRF/Django generate internally.
_TITLES = {
    400: "Invalid request",
    401: "Not signed in",
    403: "Not allowed",
    404: "Not found",
    405: "Method not allowed",
    409: "Conflict",
    415: "Unsupported media type",
    429: "Too many requests",
    500: "Server error",
}

# Anything matching these is Django/DRF talking to itself, not to a person.
_INTERNAL_PHRASES = (
    "matches the given query",   # get_object_or_404
    "No %s matches",
)


def _flatten(detail, prefix=""):
    """Turn DRF's nested error structure into one readable sentence."""
    if isinstance(detail, dict):
        parts = []
        for key, value in detail.items():
            label = key if key != "non_field_errors" else ""
            parts.append(_flatten(value, f"{label}: " if label else ""))
        return " ".join(p for p in parts if p)
    if isinstance(detail, list):
        return prefix + " ".join(str(d) for d in detail)
    return prefix + str(detail)


def rfc7807_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        # Not a DRF exception — let Django's own 500 handling deal with it, so
        # we never swallow a genuine crash into a tidy-looking 500 body.
        return None

    status_code = response.status_code
    title = _TITLES.get(status_code, "Request failed")
    detail = _flatten(response.data) if response.data is not None else title

    # Replace Django's internal phrasing rather than forwarding it to a user.
    if any(phrase.replace("%s", "") in detail for phrase in _INTERNAL_PHRASES):
        detail = "That record does not exist, or you do not have access to it."

    body = {
        "type": "about:blank",
        "title": title,
        "status": status_code,
        "detail": detail or title,
    }

    # Keep the per-field map for forms that want to highlight inputs — the
    # flattened `detail` is for humans, `errors` is for the UI.
    if status_code == 400 and isinstance(response.data, dict):
        body["errors"] = response.data

    response.data = body
    response.content_type = "application/problem+json"
    return response
