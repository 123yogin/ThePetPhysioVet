"""Shared field validation.

Phone numbers are not cosmetic here. A doctor-created patient is linked to an
owner's account by *matching the phone string* (migration 0010), and the clinic
rings that number to confirm a visit. Two failures follow from having no
validation at all, and both are silent:

- A typo is stored verbatim. `9800r91879` was accepted by the live API during a
  QA run — a number with a letter in it, which nobody can call.
- The same number written two ways ("+91 98000 11122" and "9800011122") does not
  match itself, so the pet never reaches the owner's portal and they cannot see
  their own animal.

So input is normalised to one canonical form as well as checked.

Deliberately NOT stripping country codes. Dropping "+91" to compare the last ten
digits would make two genuinely different international numbers collide, and
this data reaches a phone dialler.
"""
import re

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

# Separators people actually type: spaces, hyphens, dots, brackets, non-breaking
# spaces pasted out of a browser.
_SEPARATORS = re.compile(r"[\s\-.() ]")
_VALID = re.compile(r"^\+?\d{10,15}$")

MESSAGE = (
    "Enter a phone number the clinic can call — 10 to 15 digits, "
    "optionally starting with a country code like +91."
)


def normalise_phone(value):
    """Strip the separators, keep a leading +, and require 10-15 digits.

    Returns the canonical string. Raises DRF's ValidationError so serializers
    surface it as a 400 with a readable message rather than a 500.
    """
    if value is None:
        return value
    cleaned = _SEPARATORS.sub("", str(value)).strip()
    if not cleaned:
        return ""
    if not _VALID.match(cleaned):
        raise serializers.ValidationError(MESSAGE)
    return cleaned


def validate_phone_model(value):
    """The same rule for model-level `validators=[...]`.

    Model validators run under `full_clean()`, which the admin calls, so a
    number typed into Django admin is held to the rule the API enforces.
    """
    if not value:
        return
    cleaned = _SEPARATORS.sub("", str(value)).strip()
    if not _VALID.match(cleaned):
        raise DjangoValidationError(MESSAGE)


# ---------------------------------------------------------------- Aadhaar ----
#
# The 12th digit of an Aadhaar number is a Verhoeff checksum of the first
# eleven, which is the check UIDAI itself publishes and the only way to reject a
# mistyped number offline (no lookup, no PII sent anywhere). The Verhoeff
# algorithm's three tables (multiplication `d`, permutation `p`, inverse `inv`)
# are standard and public. A number is valid iff running the checksum over all
# twelve digits yields 0. UIDAI also never issues a number beginning with 0 or 1.
_VERHOEFF_D = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 2, 3, 4, 0, 6, 7, 8, 9, 5),
    (2, 3, 4, 0, 1, 7, 8, 9, 5, 6),
    (3, 4, 0, 1, 2, 8, 9, 5, 6, 7),
    (4, 0, 1, 2, 3, 9, 5, 6, 7, 8),
    (5, 9, 8, 7, 6, 0, 4, 3, 2, 1),
    (6, 5, 9, 8, 7, 1, 0, 4, 3, 2),
    (7, 6, 5, 9, 8, 2, 1, 0, 4, 3),
    (8, 7, 6, 5, 9, 3, 2, 1, 0, 4),
    (9, 8, 7, 6, 5, 4, 3, 2, 1, 0),
)
_VERHOEFF_P = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 5, 7, 6, 2, 8, 3, 0, 9, 4),
    (5, 8, 0, 3, 7, 9, 6, 1, 4, 2),
    (8, 9, 1, 6, 0, 4, 3, 5, 2, 7),
    (9, 4, 5, 3, 1, 2, 6, 8, 7, 0),
    (4, 2, 8, 6, 5, 7, 3, 9, 0, 1),
    (2, 7, 9, 3, 8, 0, 6, 4, 1, 5),
    (7, 0, 4, 6, 9, 1, 3, 2, 5, 8),
)

AADHAAR_MESSAGE = "Enter a valid 12-digit Aadhaar number."


def is_valid_aadhaar(value):
    """True iff `value` is a 12-digit string with a correct Verhoeff checksum
    and a leading digit of 2-9. No network, no storage of anything derived."""
    s = _SEPARATORS.sub("", str(value or "")).strip()
    if len(s) != 12 or not s.isdigit() or s[0] in "01":
        return False
    c = 0
    for i, digit in enumerate(reversed([int(x) for x in s])):
        c = _VERHOEFF_D[c][_VERHOEFF_P[i % 8][digit]]
    return c == 0


def validate_aadhaar(value):
    """Serializer-friendly: return the cleaned 12 digits, or raise a 400.
    Empty is allowed (the caller decides whether the field is required)."""
    s = _SEPARATORS.sub("", str(value or "")).strip()
    if not s:
        return ""
    if not is_valid_aadhaar(s):
        raise serializers.ValidationError(AADHAAR_MESSAGE)
    return s
