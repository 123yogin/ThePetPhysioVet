"""Signed download of an uploaded file: `GET /files/<token>`.

Uploads live in Postgres on Vercel (appointments/storage.py), so there is no
static media origin to link to. Serializers render a 15-minute signed token
for records the caller is already allowed to see; presenting the token is the
capability, which lets a plain `<a href>` or `<img src>` -- with no bearer
header -- open the file. The token binds the storage name and, for database
storage, the StoredFile row id; forged, expired or dangling tokens are a 404.
Requests are rate limited per client IP (429).

The response carries the same safety as the old `_media_serve`: a forced
`attachment` disposition and `nosniff`, and anything whose stored type is not
on the upload allow-list goes out as application/octet-stream.
"""

import mimetypes
import os

from django.core.exceptions import SuspiciousFileOperation
from django.core.files.storage import default_storage
from django.http import FileResponse
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny

from ..serializers import ALLOWED_UPLOAD_TYPES, PET_PHOTO_TYPES
from ..storage import parse_file_token, FILE_TOKEN_MAX_AGE
from ._shared import _client_ip, _rate_limited, problem

# Unauthenticated by design, so bounded per client IP (see `_client_ip` for
# why that is a coarse bucket behind the edge). A pet page renders a handful
# of links; 300/hour leaves room for a busy clinic browser.
FILE_DOWNLOAD_WINDOW_SECONDS = 60 * 60
FILE_DOWNLOAD_IP_LIMIT = 5000


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def file_download_view(request, token):
    if _rate_limited(f"filedl:ip:{_client_ip(request)}",
                     FILE_DOWNLOAD_IP_LIMIT, FILE_DOWNLOAD_WINDOW_SECONDS):
        return problem(429, "Too many requests", "Too many downloads. Please try again later.")
    parsed = parse_file_token(token)
    if parsed is None:
        raise NotFound()
    name, row_id = parsed
    try:
        if hasattr(default_storage, "open_bound"):
            # Database storage: the token must name this exact row, so it dies
            # with the row even if the name were ever stored again.
            if not row_id:
                raise NotFound()
            fh = default_storage.open_bound(name, row_id)
        else:
            fh = default_storage.open(name, "rb")
    except (FileNotFoundError, SuspiciousFileOperation):
        raise NotFound()

    content_type = getattr(fh, "content_type", None) or mimetypes.guess_type(name)[0]
    if content_type not in ALLOWED_UPLOAD_TYPES and content_type not in PET_PHOTO_TYPES:
        content_type = "application/octet-stream"

    response = FileResponse(
        fh, as_attachment=True, filename=os.path.basename(name),
        content_type=content_type,
    )
    response["X-Content-Type-Options"] = "nosniff"
    response["Cache-Control"] = f"private, max-age={FILE_TOKEN_MAX_AGE}"
    return response
