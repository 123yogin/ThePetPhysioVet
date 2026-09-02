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


# Media is served by Django in local dev, and in the single-container
# deployment where there is no nginx to do it (settings.SERVE_SPA). Both go
# through `_media_serve` so the Content-Disposition guard above applies either
# way. With nginx in front, neither is true and Django stays out of it.
if settings.DEBUG or settings.SERVE_SPA:
    media_prefix = settings.MEDIA_URL.lstrip("/")
    urlpatterns += [
        re_path(
            r"^%s(?P<path>.*)$" % re.escape(media_prefix),
            _media_serve,
            {"document_root": settings.MEDIA_ROOT},
        ),
    ]


if settings.SERVE_SPA:
    from django.http import Http404, HttpResponse
    from django.views.decorators.cache import never_cache

    _INDEX = settings.SPA_DIST_DIR / "index.html"

    @never_cache
    def _spa_index(request, path=""):
        """Serve the SPA shell for any non-API path (client-side routing).

        React Router owns /dashboard, /owner/pets/<uuid>, /reset-password and
        the rest. A hard refresh or a pasted deep link arrives here as a real
        HTTP request, and without this it would 404. Never cached: the shell
        references hashed asset filenames that change every deploy, so a
        cached copy would point at bundles that no longer exist.
        """
        if not _INDEX.is_file():
            raise Http404(
                "SPA bundle missing. Was the frontend built into SPA_DIST_DIR?"
            )
        return HttpResponse(_INDEX.read_bytes(), content_type="text/html")

    urlpatterns += [
        # Everything not already matched. api/, admin/, static/ and media/ are
        # registered above and win; this only catches real front-end routes.
        re_path(r"^(?!api/|admin/|static/|media/).*$", _spa_index),
    ]
