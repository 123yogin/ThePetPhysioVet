"""``manage.py send_due_reminders`` — cron-able reminder firing (SRS §3.7).

Designed to run every minute from cron. It is **idempotent**: each due reminder
carries a stable ``dedup_key`` and :func:`appointments.notifications.notify`
does ``get_or_create`` on it, so a reminder fires at most once per offset even if
the command runs repeatedly inside the ±window (US-NOTIF-04). Suppression on
cancel/reschedule is handled in :mod:`appointments.reminders` by reading the
appointment's CURRENT status/time (US-NOTIF-05).

``now`` is injectable (``--now <ISO 8601>``) so tests are fully time-controlled
with no wall-clock dependence; it defaults to :func:`django.utils.timezone.now`.

Examples::

    ./.venv/bin/python manage.py send_due_reminders
    ./.venv/bin/python manage.py send_due_reminders --now 2026-07-24T08:30:00
"""

import datetime

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from ...services.notifications import notify
from ...models import Notification
from ...services.reminders import due_reminders


class Command(BaseCommand):
    help = (
        "Fire due appointment reminders (24h/1h/30min before). "
        "Cron-able every minute; idempotent; suppresses cancelled/rescheduled."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--now",
            dest="now",
            default=None,
            help=(
                "Override 'now' (ISO 8601, e.g. 2026-07-24T08:30:00) for "
                "deterministic testing. Defaults to the current time."
            ),
        )

    def handle(self, *args, **options):
        now = self._parse_now(options.get("now"))
        reminders = due_reminders(now)

        for reminder in reminders:
            # notify() is idempotent on dedup_key and best-effort: it creates and
            # delivers on first sight, and on a re-run returns the existing row
            # WITHOUT re-delivering. Delivery (SMS to owner + FCM/in-app to the
            # doctor) is recorded via DeliveryLog inside the dispatcher.
            notify(
                user=reminder.doctor,
                type=Notification.REMINDER,
                message=reminder.message,
                dedup_key=reminder.dedup_key,
                sms_to=reminder.owner_phone or None,
                sms_body=reminder.sms_body,
                push=True,
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"send_due_reminders: {len(reminders)} due reminder(s) processed "
                f"at {now.isoformat()}."
            )
        )

    def _parse_now(self, raw):
        if not raw:
            return timezone.now()
        try:
            parsed = datetime.datetime.fromisoformat(raw)
        except ValueError as exc:
            raise CommandError(f"--now is not a valid ISO 8601 datetime: {raw!r}") from exc
        if timezone.is_naive(parsed):
            parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
        return parsed
