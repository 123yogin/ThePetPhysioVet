"""Every SMS the clinic sends, in one place.

Transactional only (TRAI): each text is about a visit or stay the owner
booked. No offers, no marketing -- those need a DLT-registered promotional
header the clinic SIM does not have.

Kept to one 160-character GSM-7 segment (pinned by
test_sms.TriggerTests.test_every_template_fits_one_gsm_segment): ASCII
hyphen not an em dash, and long pet names are shortened.
"""
from django.conf import settings

_PET_MAX = 25


def _pet(name):
    name = " ".join(str(name or "").split()) or "Your pet"
    return name if len(name) <= _PET_MAX else name[: _PET_MAX - 1].rstrip() + "."


def _day(d):
    return f"{d:%a} {d.day} {d:%b}"            # Thu 9 Oct


def _clock(t):
    return t.strftime("%I:%M %p").lstrip("0")  # 11:00 AM, 9:30 AM


def _when(d, t):
    return f"{_day(d)}, {_clock(t)}"


def _brand():
    return settings.CLINIC_NAME


def _phone():
    return settings.CLINIC_PHONE


def appointment_confirmed(pet, d, t):
    return (f"{_brand()}: {_pet(pet)}'s appointment is confirmed for {_when(d, t)}. "
            f"Call {_phone()} to change.")


def appointment_moved(pet, d, t):
    return (f"{_brand()}: {_pet(pet)}'s appointment has moved to {_when(d, t)}. "
            f"Call {_phone()} to change.")


def appointment_reminder(pet, d, t):
    return (f"{_brand()}: reminder - {_pet(pet)}'s appointment is tomorrow, {_when(d, t)}. "
            f"Call {_phone()} to change.")


def boarding_confirmed(pet, check_in, departure, reference):
    return (f"{_brand()}: {_pet(pet)}'s stay is confirmed, {_day(check_in)} to {_day(departure)} "
            f"(ref {reference}). Call {_phone()} to change.")


def boarding_checkout(pet, departure):
    return (f"{_brand()}: {_pet(pet)}'s stay ends today, {_day(departure)}. "
            f"Please plan pick-up. Call {_phone()} with questions.")


def test_message():
    return f"{_brand()} test message"
