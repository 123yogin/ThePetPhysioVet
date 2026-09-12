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
