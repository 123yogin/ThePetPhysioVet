from django.contrib import admin
from django.urls import path, re_path, include
from django.conf import settings
from django.http import JsonResponse


def _api_not_found(request, rest=""):
    """Any /api/* path no route matched. Without this Django answered with its
    HTML 404 page, so an API client got markup where it expects problem+json
    (live QA D8). Same wording as every other 404 in this API."""
    return JsonResponse(
        {"type": "about:blank", "title": "Not found", "status": 404,
         "detail": "That record does not exist, or you do not have access to it."},
        status=404, content_type="application/problem+json",
    )


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("appointments.urls")),
    path("api/", include("appointments.urls")),
    # Last of the api/ patterns, so it only sees paths nothing above matched.
    re_path(r"^api/(?P<rest>.*)$", _api_not_found),
]


# There is deliberately NO /media/ route (removed 2026-10-08, security
# review). It served any uploaded diagnostic report, query attachment or pet
# photo to anyone holding the path, with no authentication. Every upload is
# now reached only through the signed, 15-minute `GET /api/v1/files/<token>`
# (appointments/views/files.py), for either storage backend.


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
        # Everything not already matched. api/, admin/ and static/ are
        # registered above and win; this only catches real front-end routes.
        # media/ stays excluded so an old /media/ link is a 404, not the SPA.
        re_path(r"^(?!api/|admin/|static/|media/).*$", _spa_index),
    ]
