"""Who can sign in, and the single-use tokens that let a locked-out user back in.

Split out of a single 583-line models.py. Cross-model foreign keys are lazy
"appointments.X" strings, so these modules import nothing from each other and
cannot form a cycle. No schema changed: Django keys models by app_label and
class name, not module path.
"""
import uuid

from django.db import models
from django.contrib.auth.models import AbstractUser


class UserProfile(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ROLE_CHOICES = (
        ("DOCTOR", "Doctor"),
        ("OWNER", "Pet Owner"),
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="DOCTOR")
    # Known-issue #8: email uniqueness was not enforced at all, so two
    # accounts could share an email and break password-reset / account
    # recovery. `create_user()` (and Django's UserManager defaults) leave
    # `email=""` when none is supplied, so a plain `unique=True` would break
    # the moment a second user was created without an email. A partial
    # unique constraint (below) allows any number of blank emails while
    # still enforcing uniqueness on real ones.
    email = models.EmailField("email address", blank=True)
    clinic_name = models.CharField(max_length=255, blank=True, default="")
    clinic_address = models.TextField(blank=True, default="")
    clinic_phone = models.CharField(max_length=50, blank=True, default="")
    phone = models.CharField(max_length=50, blank=True, default="")

    class Meta(AbstractUser.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["email"],
                condition=~models.Q(email=""),
                name="unique_nonblank_userprofile_email",
            ),
        ]

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.role})"

class PasswordResetToken(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    """Single-use, time-limited token backing `POST
    /auth/password-reset/{request,confirm}` (API_CONTRACT.md §3 Auth).

    SECURITY: only a SHA-256 hash of the raw token is ever stored here (see
    `views._issue_password_reset` / `views.password_reset_confirm_view`) — a
    leaked `db.sqlite3` (or its Postgres equivalent) must not yield a working
    reset link. SHA-256 rather than bcrypt/PBKDF2 is deliberate: the raw
    value is `secrets.token_urlsafe(32)` — 256 bits of CSPRNG entropy, not a
    low-entropy human-chosen password — so a slow, salted password hash
    defends against nothing here and only adds needless CPU cost per
    request. Lookups are `token_hash=<sha256 of presented token>` (an
    indexed equality query, never an iterate-and-compare over all rows),
    which is also what keeps the comparison free of raw-token-dependent
    timing: the app never compares the raw token to anything, only opaque
    hashes neither side can usefully time-attack.
    """
    user = models.ForeignKey(
        "appointments.UserProfile", on_delete=models.CASCADE, related_name="password_reset_tokens",
    )
    token_hash = models.CharField(max_length=64, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        state = "used" if self.used_at else "unused"
        return f"PasswordResetToken(user={self.user_id}, {state})"
