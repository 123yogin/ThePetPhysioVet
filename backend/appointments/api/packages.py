"""Package read endpoint for the billing domain (SRS §3.8, US-PAY-04).

Exposes a single owner-scoped, read-only view over a prepaid session
:class:`~appointments.models.Package`. The *decrement* logic itself lives in the
shared foundation module ``billing_service.consume_package_session`` (invoked
from ``AppointmentCompleteView.post``); this module only renders the resulting
counter so a doctor can see ``used_sessions`` / ``remaining`` / ``exhausted``
after completing package-covered appointments.

AuthZ in depth (CLAUDE.md rule 4): the view requires an authenticated vet
(``IsVet``) and additionally scopes the lookup to packages whose invoice belongs
to the caller (``invoice__doctor=request.user``), so a doctor can never read
another doctor's package — a foreign / unknown id is an indistinguishable 404.
"""

from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from .core import IsVet
from ..serializers.billing import PackageSerializer
from ..models import Package


class PackageDetailView(APIView):
    """GET /packages/{id} — the live session counter for a prepaid package.

    Returns ``PackageSerializer`` (``total_sessions``, ``used_sessions``,
    ``remaining``, ``exhausted``). Ownership is enforced through
    ``package.invoice.doctor``; the row is 404 for any other doctor.
    """

    permission_classes = [IsVet]

    def get(self, request, pk):
        package = get_object_or_404(
            Package.objects.select_related("invoice"),
            pk=pk,
            invoice__doctor=request.user,
        )
        return Response(PackageSerializer(package).data)
