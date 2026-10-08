"""Rehab checklist: therapy catalogue, schedule expansion, session syncing.

A plan's `schedule` ([{therapy, frequency, weekdays}]) is expanded into one
`RehabSession` row per therapy-day. Cadence is always computed from the plan's
ORIGINAL start_date, so extending a plan continues alternate-day / bi-weekly
rhythm rather than restarting it.
"""

import re
from datetime import timedelta

from django.db import transaction

THERAPY_GROUPS = [
    {"group": "Electro-physical", "therapies": [
        "Pulsed Electro-Magnetic Field (PEMF)", "Class IV Laser Therapy", "TENS",
        "Ultrasound Therapy", "Electro-acupuncture",
    ]},
    {"group": "Manual", "therapies": [
        "Massage", "Exercise", "Acupressure", "Strength Training",
        "Balance Training", "Walk on Special Mat",
    ]},
    {"group": "Special", "therapies": ["Acupuncture", "Hydrotherapy"]},
]
ALL_THERAPIES = frozenset(t for g in THERAPY_GROUPS for t in g["therapies"])

FREQUENCIES = [
    {"code": "EVERYDAY", "label": "Every day", "weekdays_required": 0},
    {"code": "ALTERNATE_DAY", "label": "Every alternate day", "weekdays_required": 0},
    {"code": "TWICE_WEEKLY", "label": "Twice a week", "weekdays_required": 2},
    {"code": "WEEKLY", "label": "Once a week", "weekdays_required": 1},
    {"code": "BIWEEKLY", "label": "Bi-weekly", "weekdays_required": 1},
]
WEEKDAYS_REQUIRED = {f["code"]: f["weekdays_required"] for f in FREQUENCIES}

DEFAULT_PLAN_DAYS = 7
MAX_PLAN_DAYS = 366  # bounds how many rows one request can make us generate


_DURATION_RE = re.compile(r"^(\d+)\s*(wk|w|weeks?|d|days?)$", re.IGNORECASE)


def parse_duration_days(text):
    """"4WK" / "2 weeks" / "10d" -> days; None when it is not that shape."""
    m = _DURATION_RE.match((text or "").strip())
    if not m:
        return None
    n = int(m.group(1))
    return n * 7 if m.group(2).lower().startswith("w") else n


def generate_dates(plan_start, plan_end, frequency, weekdays):
    """Planned dates (inclusive window) for one therapy. `plan_start` must be
    the plan's original start so cadence is stable across extensions."""
    if plan_end is None or plan_end < plan_start:
        return []
    days = (plan_end - plan_start).days + 1
    every = (plan_start + timedelta(days=i) for i in range(days))
    if frequency == "EVERYDAY":
        return list(every)
    if frequency == "ALTERNATE_DAY":
        return [plan_start + timedelta(days=i) for i in range(0, days, 2)]
    wanted = set(weekdays)
    hits = [x for x in every if x.weekday() in wanted]
    if frequency in ("TWICE_WEEKLY", "WEEKLY"):
        return hits
    if frequency == "BIWEEKLY":
        # Once every two weeks: first occurrence on/after start, then +14d.
        return hits[::2]
    return []


@transaction.atomic
def sync_sessions(plan, today, backfill_from=None):
    """Make the plan's sessions match its schedule.

    - Missing sessions are created (never duplicated: unique cell + ignore_conflicts).
      Only dates >= min(today, backfill_from) are created, so editing a
      schedule never invents past "missed" sessions; callers creating a
      back-dated plan or extending a lapsed one pass `backfill_from`.
    - DUE sessions dated >= today that the schedule no longer wants are deleted.
    - DONE / SKIPPED rows, and past DUE rows (missed history), are never touched.
    """
    from .models import RehabSession

    end = plan.end_date or (plan.start_date + timedelta(days=DEFAULT_PLAN_DAYS - 1))
    floor = today if backfill_from is None else min(today, backfill_from)

    desired = set()
    for entry in plan.schedule or []:
        for day in generate_dates(plan.start_date, end, entry["frequency"], entry.get("weekdays", [])):
            desired.add((entry["therapy"], day))

    existing = {
        (s.therapy, s.planned_date): s for s in RehabSession.objects.filter(plan=plan)
    }
    stale = [
        s.pk for key, s in existing.items()
        if key not in desired and s.status == "DUE" and s.planned_date >= today
    ]
    if stale:
        # Re-assert the condition in the DELETE: a doctor may have ticked one
        # of these between the read above and now.
        RehabSession.objects.filter(
            pk__in=stale, status="DUE", planned_date__gte=today,
        ).delete()

    RehabSession.objects.bulk_create(
        [
            RehabSession(plan=plan, therapy=t, planned_date=day)
            for (t, day) in sorted(desired, key=lambda k: (k[1], k[0]))
            if (t, day) not in existing and day >= floor
        ],
        ignore_conflicts=True,
    )
