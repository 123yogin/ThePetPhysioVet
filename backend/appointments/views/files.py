"""Signed download of an uploaded file: `GET /files/<token>`.

Uploads live in Postgres on Vercel (appointments/storage.py), so there is no
static media origin to link to. Serializers render a 15-minute signed token
for records the caller is already allowed to see; presenting the token is the
capability, which lets a plain `<a href>` or `<img src>` -- with no bearer
header -- open the file. Forged, expired or dangling tokens are a 404.

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

from ..serializers import ALLOWED_UPLOAD_TYPES
from ..storage import name_from_token, FILE_TOKEN_MAX_AGE


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def file_download_view(request, token):
    name = name_from_token(token)
    if name is None:
        raise NotFound()
    try:
        fh = default_storage.open(name, "rb")
    except (FileNotFoundError, SuspiciousFileOperation):
        raise NotFound()

    content_type = getattr(fh, "content_type", None) or mimetypes.guess_type(name)[0]
    if content_type not in ALLOWED_UPLOAD_TYPES:
        content_type = "application/octet-stream"

    response = FileResponse(
        fh, as_attachment=True, filename=os.path.basename(name),
        content_type=content_type,
    )
    response["X-Content-Type-Options"] = "nosniff"
    response["Cache-Control"] = f"private, max-age={FILE_TOKEN_MAX_AGE}"
    return response
