"""Shared domain helpers used by both the template views and the JSON API.

Keeping the WhatsApp / SMS share-message construction here (rather than in
views.py) means the Django-rendered ``share`` page and the ``/api/v1`` share
endpoint build byte-for-byte identical message bodies and URLs.
"""

from urllib.parse import quote

import bleach
from django.conf import settings

from ..models import Appointment

# Rich-text notes (diagnoses + progress notes) are authored in the SPA and
# rendered back via dangerouslySetInnerHTML, so we sanitise them server-side to
# a small safe allowlist before persisting — prevents stored XSS.
SANITIZE_ALLOWED_TAGS = ["b", "i", "strong", "em", "u", "p", "br", "ul", "ol", "li", "h3", "h4"]


def sanitize_html(value: str) -> str:
    """Strip everything outside the safe rich-text allowlist (no attributes)."""
    return bleach.clean(value or "", tags=SANITIZE_ALLOWED_TAGS, attributes={}, strip=True)


def share_body(request, appt: Appointment) -> str:
    """Build the plain-text message body sent to the owner."""
    profile = request.user.doctor_profile
    doctor_name = appt.doctor.get_full_name().strip() or appt.doctor.get_username()
    clinic = (profile.clinic_name or "").strip() or getattr(
        settings, "DEFAULT_CLINIC_NAME", "Veterinary Clinic"
    )
    addr = (profile.clinic_address or "").strip() or getattr(settings, "DEFAULT_CLINIC_ADDRESS", "")
    clinic_phone = (profile.clinic_phone or "").strip()
    visit_line = appt.get_visit_type_display()
    if appt.visit_type == Appointment.VISIT_CLINIC:
        visit_detail = "Please come to the clinic at the address below."
    else:
        visit_detail = "Home visit — the veterinarian will come to you. Confirm the address by reply if needed."

    lines = [
        f"Hello {appt.owner_name},",
        "",
        f"Pet: {appt.pet_name} ({appt.pet_type})",
        f"Visit type: {visit_line}",
        visit_detail,
        f"Appointment: {appt.date} at {appt.time}",
        f"Doctor: Dr. {doctor_name}",
        f"Clinic: {clinic}",
    ]
    if addr:
        lines.append(f"Clinic address: {addr}")
    if clinic_phone:
        lines.append(f"Clinic phone: {clinic_phone}")
    if appt.reason_notes.strip():
        lines.extend(["", "Notes:", appt.reason_notes.strip()])
    lines.extend(["", "— Sent via ThePetPhysioVet"])
    return "\n".join(lines)


def build_share_urls(appt: Appointment, body: str):
    """Return (whatsapp_url, sms_url) for the given message body."""
    encoded = quote(body, safe="")
    digits = "".join(c for c in appt.owner_phone if c.isdigit())
    if len(digits) >= 8:
        whatsapp_url = f"https://wa.me/{digits}?text={encoded}"
    else:
        whatsapp_url = f"https://wa.me/?text={encoded}"
    sms_target = appt.owner_phone.strip() or digits
    sms_url = f"sms:{sms_target}?body={quote(body)}" if sms_target else "#"
    return whatsapp_url, sms_url


def share_payload(request, appt: Appointment) -> dict:
    """Full share payload (urls + contact fields) for the JSON API."""
    body = share_body(request, appt)
    whatsapp_url, sms_url = build_share_urls(appt, body)
    return {
        "whatsapp_url": whatsapp_url,
        "sms_url": sms_url,
        "pet_name": appt.pet_name,
        "owner_name": appt.owner_name,
        "owner_phone": appt.owner_phone,
    }
