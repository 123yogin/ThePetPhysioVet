import datetime
from decimal import Decimal

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.utils import timezone

from appointments.models import (
    UserProfile, Pet, Appointment, DiagnosticReport,
    TreatmentPlan, ProgressNote, Invoice, LineItem, Payment, Package,
    Notification, NotificationPref, QueryThread, QueryMessage, QueryAttachment,
)


class Command(BaseCommand):
    help = "Seeds a realistic demo dataset exercising every model. Safe to re-run."

    def handle(self, *args, **options):
        self.stdout.write("Seeding demo data...")
        today = datetime.date.today()

        # ------------------------------------------------------------
        # Users (doctor + 3 owners, all with real hashed passwords)
        # ------------------------------------------------------------
        doctor = self._ensure_user(
            "dr_dhanvi", "DoctorPass123!",
            email="dr.dhanvi.patel@petphysio.com",
            first_name="Dr. Dhanvi", last_name="Patel", role="DOCTOR",
            clinic_name="The Pet Physio Vet Clinic (Dr. Dhanvi Patel)",
            clinic_address="123 Healing Paws Lane, Bandra West, Mumbai",
            clinic_phone="+91 98200 12345",
            phone="+91 98200 12345",
        )

        sarah = self._ensure_user(
            "owner_sarah", "OwnerPass123!",
            email="sarah.j@example.com",
            first_name="Sarah", last_name="Johnson", role="OWNER",
            phone="+91 98765 43210",
        )
        rahul = self._ensure_user(
            "owner_rahul", "OwnerPass123!",
            email="rahul.s@example.com",
            first_name="Rahul", last_name="Sharma", role="OWNER",
            phone="+91 98111 22233",
        )
        priya = self._ensure_user(
            "owner_priya", "OwnerPass123!",
            email="priya.k@example.com",
            first_name="Priya", last_name="Kapoor", role="OWNER",
            phone="+91 99887 66554",
        )

        # ------------------------------------------------------------
        # Pets (linked to their owner and treating doctor)
        # ------------------------------------------------------------
        max_pet, _ = Pet.objects.update_or_create(
            name="Max", owner_phone=sarah.phone,
            defaults=dict(
                species="Dog", pet_type="Golden Retriever", breed="Golden Retriever",
                age="4 years", sex="Male", weight="28.5",
                owner_name="Sarah Johnson", owner_email=sarah.email,
                medical_history="Cruciate ligament surgery in 2024.",
                complaint="Left hind leg stiffness after morning walk.",
                complaint_started=str(today - datetime.timedelta(days=30)),
                referred_by="Dr. Patel Vet Clinic",
                notes="Responds well to laser therapy and gentle range-of-motion stretching.",
                owner=sarah, doctor=doctor,
            ),
        )

        luna_pet, _ = Pet.objects.update_or_create(
            name="Luna", owner_phone=rahul.phone,
            defaults=dict(
                species="Cat", pet_type="Persian Cat", breed="Persian",
                age="2 years", sex="Female", weight="4.2",
                owner_name="Rahul Sharma", owner_email=rahul.email,
                medical_history="Minor spinal concussive injury.",
                complaint="Reluctance to jump onto furniture.",
                complaint_started=str(today - datetime.timedelta(days=28)),
                referred_by="Direct walk-in",
                notes="Requires slow acclimatization to therapy area.",
                owner=rahul, doctor=doctor,
            ),
        )

        bruno_pet, _ = Pet.objects.update_or_create(
            name="Bruno", owner_phone=priya.phone,
            defaults=dict(
                species="Dog", pet_type="Labrador Retriever", breed="Labrador",
                age="6 years", sex="Male", weight="32.0",
                owner_name="Priya Kapoor", owner_email=priya.email,
                medical_history="Hip dysplasia, managed conservatively.",
                complaint="Reduced stamina on evening walks.",
                complaint_started=str(today - datetime.timedelta(days=60)),
                referred_by="Self-referred",
                notes="Prefers hydrotherapy over land-based exercises.",
                owner=priya, doctor=doctor,
            ),
        )

        # ------------------------------------------------------------
        # Appointments — some TODAY so the dashboard is non-empty.
        # ------------------------------------------------------------
        self._ensure_appointment(
            pet=max_pet, doctor=doctor, date=today, time=datetime.time(9, 30),
            visit_type="Followup", visit_type_display="Follow-up Session",
            status="Confirmed", reason_notes="Laser therapy follow-up for left stifle.",
        )
        self._ensure_appointment(
            pet=luna_pet, doctor=doctor, date=today, time=datetime.time(11, 0),
            visit_type="Followup", visit_type_display="Follow-up Session",
            status="Confirmed", reason_notes="Spinal mobility review.",
        )
        self._ensure_appointment(
            pet=bruno_pet, doctor=doctor, date=today - datetime.timedelta(days=3),
            time=datetime.time(15, 0),
            visit_type="Initial", visit_type_display="Initial Consultation",
            status="Completed", reason_notes="Initial hydrotherapy assessment.",
        )
        self._ensure_appointment(
            pet=bruno_pet, doctor=doctor, date=today + datetime.timedelta(days=4),
            time=datetime.time(10, 0),
            visit_type="Reassessment", visit_type_display="Re-assessment",
            status="Reschedule Requested",
            requested_date=today + datetime.timedelta(days=6),
            requested_time=datetime.time(10, 0),
            reschedule_reason="Owner travelling, requested a later slot.",
            reason_notes="6-week hydrotherapy progress reassessment.",
        )

        # ------------------------------------------------------------
        # Treatment plans + progress notes
        # ------------------------------------------------------------
        max_plan, _ = TreatmentPlan.objects.update_or_create(
            pet=max_pet, status="ACTIVE",
            defaults=dict(
                therapies=["Laser Therapy", "Passive Range of Motion", "Hydrotherapy"],
                frequency="2x/week", frequency_custom="",
                duration="4 weeks", duration_custom="",
                start_date=today - datetime.timedelta(days=14),
                end_date=today + datetime.timedelta(days=14),
            ),
        )
        ProgressNote.objects.get_or_create(
            plan=max_plan, session_no=1,
            defaults={"notes": "Good range of motion, mild discomfort on full extension."},
        )
        ProgressNote.objects.get_or_create(
            plan=max_plan, session_no=2,
            defaults={"notes": "Improved weight-bearing on left hind leg, continuing plan."},
        )

        bruno_plan, _ = TreatmentPlan.objects.update_or_create(
            pet=bruno_pet, status="COMPLETED",
            defaults=dict(
                therapies=["Hydrotherapy", "Strength Conditioning"],
                frequency="1x/week", frequency_custom="",
                duration="6 weeks", duration_custom="",
                start_date=today - datetime.timedelta(days=60),
                end_date=today - datetime.timedelta(days=18),
                completed_at=timezone.now() - datetime.timedelta(days=18),
            ),
        )
        ProgressNote.objects.get_or_create(
            plan=bruno_plan, session_no=1,
            defaults={"notes": "Noticeably improved stamina; owner reports longer walks tolerated."},
        )

        # ------------------------------------------------------------
        # Diagnostic reports (file uploads)
        # ------------------------------------------------------------
        self._ensure_diagnostic_report(
            pet=max_pet, report_type="XRAY", filename="max_stifle_xray.png",
            content=b"fake-xray-bytes", mime="image/png",
            notes="Mild osteoarthritic changes, left stifle joint.",
        )
        self._ensure_diagnostic_report(
            pet=bruno_pet, report_type="BLOOD", filename="bruno_bloodwork.pdf",
            content=b"%PDF-1.4 fake bloodwork report", mime="application/pdf",
            notes="CBC and biochemistry within normal limits.",
        )

        # ------------------------------------------------------------
        # Invoices, line items, payments, and a package
        # ------------------------------------------------------------
        max_invoice, _ = Invoice.objects.update_or_create(
            invoice_no="INV-2026-001",
            defaults=dict(pet=max_pet, owner=sarah, tax=Decimal("0.00"), payment_mode="post_treatment"),
        )
        self._ensure_line_item(max_invoice, "Initial Physiotherapy Consultation & Assessment", 1, Decimal("2500.00"))
        self._ensure_line_item(max_invoice, "Class IV Cold Laser Therapy Session", 1, Decimal("1200.00"))
        self._ensure_payment(max_invoice, Decimal("2000.00"), gateway_ref="RZP-DEMO-0001")

        bruno_invoice, _ = Invoice.objects.update_or_create(
            invoice_no="INV-2026-002",
            defaults=dict(pet=bruno_pet, owner=priya, tax=Decimal("90.00"), payment_mode="post_treatment"),
        )
        self._ensure_line_item(bruno_invoice, "Initial Hydrotherapy Assessment", 1, Decimal("1800.00"))
        self._ensure_payment(bruno_invoice, Decimal("1890.00"), gateway_ref="RZP-DEMO-0002")

        luna_invoice, _ = Invoice.objects.update_or_create(
            invoice_no="INV-2026-003",
            defaults=dict(pet=luna_pet, owner=rahul, tax=Decimal("0.00"), payment_mode="package"),
        )
        self._ensure_line_item(luna_invoice, "10-Session Feline Rehab Package", 1, Decimal("9000.00"))
        Package.objects.update_or_create(
            invoice=luna_invoice, defaults={"total_sessions": 10, "used_sessions": 3},
        )
        # No payment recorded yet — demonstrates a PENDING invoice.

        # ------------------------------------------------------------
        # Notifications
        # ------------------------------------------------------------
        self._ensure_notification(
            doctor, "APPOINTMENT_TODAY",
            f"You have {2} appointments today.",
            link="/appointments",
        )
        self._ensure_notification(
            sarah, "PAYMENT_RECEIVED",
            f"Payment of Rs. 2000 received for invoice {max_invoice.invoice_no}.",
            link=f"/owner/invoices/{max_invoice.id}",
        )
        self._ensure_notification(
            rahul, "INVOICE_PENDING",
            f"Invoice {luna_invoice.invoice_no} is pending payment.",
            link=f"/owner/invoices/{luna_invoice.id}",
        )

        # ------------------------------------------------------------
        # Query thread with a two-way conversation
        # ------------------------------------------------------------
        thread, _ = QueryThread.objects.get_or_create(pet=max_pet)
        owner_msg, _ = QueryMessage.objects.get_or_create(
            thread=thread, sender_role="OWNER",
            message="Hi Doctor, Max seems a bit tight on his left hind leg after this "
                    "morning walk. Should I apply an ice pack?",
            defaults={"sender": sarah, "sender_name": sarah.get_full_name() or sarah.username},
        )
        if owner_msg.sender_id is None:
            owner_msg.sender = sarah
            owner_msg.sender_name = sarah.get_full_name() or sarah.username
            owner_msg.save(update_fields=["sender", "sender_name"])

        QueryMessage.objects.get_or_create(
            thread=thread, sender_role="DOCTOR",
            message="A short 10-minute ice pack session is fine — keep it wrapped in a "
                    "towel and avoid direct skin contact. Let's reassess at the next visit.",
            defaults={"sender": doctor, "sender_name": doctor.get_full_name() or doctor.username},
        )

        self.stdout.write(self.style.SUCCESS("Demo data seeded successfully!\n"))
        self.stdout.write(self.style.SUCCESS("Demo credentials (username / password):"))
        self.stdout.write(f"  Doctor : dr_dhanvi / DoctorPass123!")
        self.stdout.write(f"  Owner  : owner_sarah / OwnerPass123!  (Max's owner)")
        self.stdout.write(f"  Owner  : owner_rahul / OwnerPass123!  (Luna's owner)")
        self.stdout.write(f"  Owner  : owner_priya / OwnerPass123!  (Bruno's owner)")

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _ensure_user(self, username, password, **fields):
        user, created = UserProfile.objects.get_or_create(username=username, defaults=fields)
        changed = False
        for key, value in fields.items():
            if getattr(user, key, None) != value:
                setattr(user, key, value)
                changed = True
        user.set_password(password)  # always ensure the printed demo password works
        user.save()
        return user

    def _ensure_appointment(self, pet, doctor, date, time, **fields):
        appointment, _ = Appointment.objects.update_or_create(
            pet=pet, date=date, time=time,
            defaults=dict(
                doctor=doctor, pet_name=pet.name,
                owner_name=pet.owner_name, owner_phone=pet.owner_phone,
                **fields,
            ),
        )
        return appointment

    def _ensure_diagnostic_report(self, pet, report_type, filename, content, mime, notes):
        if DiagnosticReport.objects.filter(pet=pet, original_filename=filename).exists():
            return
        report = DiagnosticReport(
            pet=pet, report_type=report_type, notes=notes,
            original_filename=filename, mime=mime, size=len(content),
        )
        report.file.save(filename, ContentFile(content), save=True)

    def _ensure_line_item(self, invoice, description, quantity, unit_price):
        LineItem.objects.update_or_create(
            invoice=invoice, description=description,
            defaults={"quantity": quantity, "unit_price": unit_price, "amount": quantity * unit_price},
        )

    def _ensure_payment(self, invoice, amount_paid, gateway_ref):
        Payment.objects.get_or_create(
            invoice=invoice, gateway_ref=gateway_ref,
            defaults={"amount_paid": amount_paid, "status": "SUCCESS"},
        )

    def _ensure_notification(self, user, type_, message, link=""):
        Notification.objects.get_or_create(
            user=user, type=type_, message=message, defaults={"link": link},
        )
