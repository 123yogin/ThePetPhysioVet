"""The doctor's patient roster and one patient's record.

NULL-doctor rows are a deliberate claimable pool, visible to any doctor, so
a new owner's first pet is not stranded.

Split out of a single 1674-line views.py. Import from `appointments.views`
as before -- every public name is re-exported by the package.
"""

from django.db.models import Max, Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from ..models import (
    UserProfile, Pet, Appointment, DiagnosticReport,
    TreatmentPlan, ProgressNote, Invoice, LineItem, Payment, Package,
    Notification, NotificationPref, QueryThread, QueryMessage, QueryAttachment,
    PasswordResetToken, Enquiry,
)
from ..permissions import IsDoctor, IsOwner, IsObjectOwner
from ..serializers import (
    UserProfileSerializer, SignupSerializer, PetSerializer, AppointmentSerializer,
    DiagnosticReportSerializer, TreatmentPlanSerializer, ProgressNoteSerializer,
    InvoiceSerializer, LineItemSerializer, PaymentSerializer, PackageSerializer,
    NotificationSerializer, NotificationPrefSerializer,
    QueryThreadSerializer, QueryMessageSerializer, QueryAttachmentSerializer,
    OwnerPetHistorySerializer, PasswordResetRequestSerializer, PasswordResetConfirmSerializer,
    EnquiryCreateSerializer, EnquirySerializer,
)

from ._shared import _doctor_scoped

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsDoctor])
def pets_view(request):
    if request.method == "GET":
        # L1 fix (2026-08-21): this used to return every pet in the clinic
        # regardless of who was asking. Seed data is single-doctor, so this
        # was invisible until a second doctor existed — then it leaked every
        # other doctor's patients. Scoped via `_doctor_scoped` (see its
        # docstring for the NULL-doctor "claimable pool" posture).
        q = request.query_params.get("q", "").strip()
        pets = _doctor_scoped(Pet, request).select_related("doctor").order_by("-created_at")
        if q:
            pets = pets.filter(
                Q(name__icontains=q) | Q(breed__icontains=q) |
                Q(owner_name__icontains=q) | Q(owner_phone__icontains=q)
            )
        return Response(PetSerializer(pets, many=True, context={"request": request}).data)

    serializer = PetSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    # `doctor` is not a serializer field (client cannot set it), so assign it
    # explicitly. The caller is guaranteed DOCTOR role by IsDoctor above, so
    # attributing the pet to the creating doctor is unambiguous.
    pet = serializer.save(doctor=request.user)
    # B4 fix: a doctor-created pet never had `owner` set, so it never
    # appeared in that pet owner's portal (`GET /owner/pets`) even when the
    # doctor entered the owner's exact phone number. Link it now when the
    # entered `owner_phone` unambiguously matches exactly one OWNER account.
    # `UserProfile.phone` is not unique, so 0 or >1 matches are left NULL
    # rather than guessed.
    if pet.owner_phone:
        matches = list(UserProfile.objects.filter(role="OWNER", phone=pet.owner_phone)[:2])
        if len(matches) == 1:
            pet.owner = matches[0]
            pet.save(update_fields=["owner"])
    photo = request.FILES.get("photo")
    if photo:
        pet.photo = photo
        pet.save()
    return Response(
        PetSerializer(pet, context={"request": request}).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated, IsDoctor])
def pet_detail_view(request, pk):
    # Follow-up L1 fix (2026-08-21): this detail route was left reachable by
    # ID for any doctor even after the list endpoint was scoped — see
    # `_doctor_scoped`.
    pet = get_object_or_404(_doctor_scoped(Pet, request), pk=pk)
    if request.method == "GET":
        return Response(PetSerializer(pet, context={"request": request}).data)

    serializer = PetSerializer(pet, data=request.data, partial=True, context={"request": request})
    serializer.is_valid(raise_exception=True)
    pet = serializer.save()
    photo = request.FILES.get("photo")
    if photo:
        pet.photo = photo
        pet.save()
    return Response(PetSerializer(pet, context={"request": request}).data)
