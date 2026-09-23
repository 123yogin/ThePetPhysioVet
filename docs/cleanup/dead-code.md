# Dead Code

## Removed — unused imports (verified by pyflakes + autoflake; suite green after)

The dominant finding was the **duplicated bulk-import block** copied into every
view module when the original 1674-line `views.py` was split by domain. Each
module imported the entire model and serializer namespace and used a handful.
`autoflake --remove-all-unused-imports --ignore-init-module-imports` was applied
(migrations excluded, `__init__.py` re-export barrels protected), then the full
420-test suite confirmed no behaviour changed.

**View modules trimmed (11):**
`views/auth.py`, `views/billing.py`, `views/clinical.py`, `views/dashboard.py`,
`views/enquiries.py`, `views/messaging.py`, `views/notifications.py`,
`views/owner.py`, `views/pets.py`, `views/scheduling.py`, `views/_shared.py`.

Example — `views/auth.py`:
- before: `from ..models import (` 18 names `)`, `from ..serializers import (` 20 names `)`
- after: `UserProfile, PasswordResetToken` + 4 serializers actually used.

**Test files + management command trimmed (9):**
`tests/base.py`, `tests/test_auth.py`, `tests/test_billing.py`,
`tests/test_contract.py`, `tests/test_error_shape.py`, `tests/test_exploits.py`,
`tests/test_password_reset.py`, `tests/test_refresh_and_hardening.py`,
`management/commands/seed_data.py` (unused model imports).

## Deliberately preserved (NOT dead)

- **`models/__init__.py`, `views/__init__.py` re-export barrels.** pyflakes flags
  their imports as "unused", but they are the package's public surface, carry
  `# noqa: F401`, and are re-exported via `__all__`. Protected with
  `--ignore-init-module-imports`. Removing them would break every
  `from appointments.models import X` call site.

## Potentially dead — NEEDS VALIDATION (not removed)

- **f-strings with no placeholders** and two unused local variables (`exc` in
  `tests/test_config_and_routes.py`, `changed` in `seed_data.py`). Left in place:
  autoflake was run in imports-only mode because removing "unused" variables can
  silently drop a variable kept for a side-effecting call. Trivial; low value.
- **`frontend/tools/` (20 CDP `.mjs` QA scripts).** Not imported by the app and
  not a wired test suite, but they are operational tooling the previous team used
  by hand. Not removed — see `remaining-work.md`.
