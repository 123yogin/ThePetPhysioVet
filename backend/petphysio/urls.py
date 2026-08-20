import re

from django.contrib import admin
from django.urls import path, re_path, include
from django.conf import settings
from django.views.static import serve as _django_static_serve

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("appointments.urls")),
    path("api/", include("appointments.urls")),
]


def _media_serve(request, path, document_root=None, show_indexes=False):
    """Wraps Django's dev static-file view to add `Content-Disposition:
    attachment` (API_CONTRACT.md §3 amendment 5, defence in depth for D1).

    An uploaded diagnostic image/PDF/DICOM is content-sniffed at write time
    (see appointments/serializers.py `_validate_upload`), but forcing a
    download disposition on the way back out means even a file that somehow
    slipped past that check (or a browser that ignores `X-Content-Type-
    Options: nosniff`) can't be rendered inline in the media origin's
    context — e.g. as HTML/SVG with script execution.

    This only covers Django's own dev-only static-file serving
    (`runserver`, `DEBUG=True`). In production, media is not served by
    Django at all — that belongs in the reverse proxy / object storage
    layer (e.g. an OCI Object Storage / CDN response-header rule), which is
    outside this app's ownership.
    """
    response = _django_static_serve(
        request, path, document_root=document_root, show_indexes=show_indexes
    )
    response["Content-Disposition"] = "attachment"
    return response


if settings.DEBUG:
    media_prefix = settings.MEDIA_URL.lstrip("/")
    urlpatterns += [
        re_path(
            r"^%s(?P<path>.*)$" % re.escape(media_prefix),
            _media_serve,
            {"document_root": settings.MEDIA_ROOT},
        ),
    ]
