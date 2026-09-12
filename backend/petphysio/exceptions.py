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


def _is_envelope_detail(key, value):
    """True for DRF's own `{"detail": "..."}` wrapper rather than a form field.

    `APIException` (NotFound, PermissionDenied, MethodNotAllowed, ...) always
    reports as `{"detail": ErrorDetail("...")}` -- a string. A serializer field
    genuinely called "detail" reports a *list* of messages, like every other
    field. Keying on the value's shape keeps the wrapper unlabelled without
    swallowing the label of a real field that happens to share the name.
    """
    return key == "detail" and not isinstance(value, (list, dict))


def _is_token_failure(data):
    """True for SimpleJWT's "this bearer token is no good" payload.

    Keyed on its `code`, which is `token_not_valid` for expired, malformed and
    blacklisted tokens alike -- rather than on the exception class, so this
    module does not have to import SimpleJWT to format its errors.
    """
    return isinstance(data, dict) and str(data.get("code", "")) == "token_not_valid"


def _flatten(detail, prefix=""):
    """Turn DRF's nested error structure into one readable sentence."""
    if isinstance(detail, dict):
        parts = []
        for key, value in detail.items():
            # "non_field_errors" and DRF's "detail" wrapper are envelopes, not
            # field names. Labelling the latter is what produced user-visible
            # strings like "detail: This action requires a doctor account." and
            # 'detail: Method "POST" not allowed.' on every DRF-raised error.
            label = "" if key == "non_field_errors" or _is_envelope_detail(key, value) else key
            parts.append(_flatten(value, f"{label}: " if label else ""))
        return " ".join(p for p in parts if p)
    if isinstance(detail, list):
        # Recurse rather than `str()`. A list element can itself be a dict --
        # SimpleJWT's `messages` is a list of them -- and stringifying one dumps
        # a Python repr, `ErrorDetail(string=..., code=...)` internals included,
        # onto the page. That was shipped: an expired session rendered
        #   "... messages: {'token_class': ErrorDetail(string='AccessToken', ...)}"
        # to a user sitting on the sign-in screen.
        return prefix + " ".join(p for p in (_flatten(d) for d in detail) if p)
    return prefix + str(detail)


def rfc7807_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        # Not a DRF exception — let Django's own 500 handling deal with it, so
        # we never swallow a genuine crash into a tidy-looking 500 body.
        return None

    status_code = response.status_code
    title = _TITLES.get(status_code, "Request failed")

    # An expired or malformed JWT is a session problem, not a report to read.
    # SimpleJWT answers with {detail, code, messages: [{token_class, ...}]}, and
    # every part of that except the fact of expiry is diagnostic -- "token_class",
    # "token_not_valid" and the rest mean nothing to a pet owner. Handled before
    # flattening so none of it can reach the page.
    if status_code == 401 and _is_token_failure(response.data):
        detail = "Your session has expired. Please sign in again."
    else:
        detail = _flatten(response.data) if response.data is not None else title

    # Every 404 says the same thing, whatever raised it.
    #
    # This used to key off Django's phrasing only, so it rewrote the body of a
    # `get_object_or_404` miss and left everything else alone. A view raising
    # `NotFound` for an object that exists but belongs to someone else came back
    # as "Not found." instead -- measured live against production:
    #
    #   GET /owner/pets/<another owner's pet>  -> "detail: Not found."
    #   GET /owner/pets/<no such pet>          -> "That record does not exist, ..."
    #
    # Two distinguishable 404s are exactly the oracle the module docstring says
    # must not exist: the short one means "this id is real, just not yours".
    # UUID keys make walking the space impractical, which is why this is a leak
    # rather than a breach -- but the invariant is the thing being defended, so
    # it is enforced here for all 404s rather than for one library's wording.
    if status_code == 404 or any(
        phrase.replace("%s", "") in detail for phrase in _INTERNAL_PHRASES
    ):
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
