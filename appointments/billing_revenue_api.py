"""Revenue dashboard endpoint (SRS §3.8).

FOUNDATION STUB. The revenue fan-out task implements the body WITHOUT editing
api_urls.py — the route -> view-class contract below is fixed.

Build guidance for the fan-out task:
  * ``?period=day|week|month`` (default month). Sum SUCCESS ``Payment`` amounts
    for the caller's own invoices within the window; scope to
    ``invoice__doctor=request.user`` (AuthZ in depth). Return the total plus any
    breakdown the dashboard widgets need.
"""

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .api import IsVet

_NOT_IMPLEMENTED = {"detail": "Not implemented yet (Sprint 4 fan-out)."}


class RevenueDashboardView(APIView):
    permission_classes = [IsVet]

    def get(self, request):
        return Response(_NOT_IMPLEMENTED, status=status.HTTP_501_NOT_IMPLEMENTED)
