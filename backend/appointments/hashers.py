"""Password hashing for the doctor auth stack (SRS §3.1 / §4).

The auth-hardening sprint moves password storage from Django's default PBKDF2
to bcrypt with a work factor of at least 12. ``BCrypt12PasswordHasher`` pins
``rounds = 12`` so the guarantee holds regardless of Django's default cost.

Wiring (petphysio/settings.py ``PASSWORD_HASHERS``):
  1. this bcrypt hasher  -> all NEW / changed passwords are stored as bcrypt≥12
  2. PBKDF2 hasher       -> legacy PBKDF2 hashes still verify on login

Because bcrypt is listed FIRST, Django transparently re-hashes a legacy
PBKDF2 password to bcrypt on the user's next successful login
(``check_password`` calls ``setter`` when the stored hash isn't the preferred
algorithm) — no bulk migration or forced reset needed.
"""

from django.contrib.auth.hashers import BCryptSHA256PasswordHasher


class BCrypt12PasswordHasher(BCryptSHA256PasswordHasher):
    """bcrypt (SHA256-prehashed) hasher pinned to a cost of 12 rounds.

    Subclassing lets us keep a stable ``algorithm`` identifier while forcing
    ``rounds`` so cost >= 12 is guaranteed even if the upstream default changes.
    """

    rounds = 12
