// Display formatting that reproduces Django template-filter output so the React
// DOM text matches the Django golden exactly.

import type { Status, VisitType } from "./types";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Django `N` month names: AP-style abbreviations (the default DATE_FORMAT
// "N j, Y" used when a template renders a raw DateField like `{{ a.date }}`).
const MONTHS_AP = [
  "Jan.",
  "Feb.",
  "March",
  "April",
  "May",
  "June",
  "July",
  "Aug.",
  "Sept.",
  "Oct.",
  "Nov.",
  "Dec.",
];

/**
 * Reproduce Django's `date:"l, F j, Y"` filter, e.g. "Wednesday, July 22, 2026".
 * Accepts an ISO date string (YYYY-MM-DD) and formats without timezone drift.
 * Used for the dashboard `today_display` (weekday is COMPUTED, never hardcoded).
 */
export function dateLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${WEEKDAYS[dt.getDay()]}, ${MONTHS[m - 1]} ${d}, ${y}`;
}

/**
 * Reproduce Django's DEFAULT date output for a raw DateField, i.e. the
 * DATE_FORMAT "N j, Y" (AP-style month), e.g. "July 22, 2026". This is what
 * `{{ a.date }}` renders in appointments.html / share.html.
 */
export function dateMedium(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS_AP[m - 1]} ${d}, ${y}`;
}

/**
 * Reproduce Django's TIME_FORMAT "P" for a raw TimeField (what `{{ a.time }}`
 * renders). Input is 24h "HH:MM". Rules:
 *   - on-the-hour drops the minutes: 11:00 -> "11 a.m.", 14:00 -> "2 p.m."
 *   - otherwise keeps them:          9:30 -> "9:30 a.m.", 14:15 -> "2:15 p.m."
 *   - midnight -> "midnight", noon -> "noon" (Django "P" special cases).
 */
export function formatTime(hhmm: string): string {
  const [h, min] = hhmm.split(":").map(Number);
  if (min === 0 && h === 0) return "midnight";
  if (min === 0 && h === 12) return "noon";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const minutes = min === 0 ? "" : `:${String(min).padStart(2, "0")}`;
  const ampm = h < 12 ? "a.m." : "p.m.";
  return `${h12}${minutes} ${ampm}`;
}

// visit_type -> human display, matching Appointment.VISIT_TYPE_CHOICES.
const VISIT_TYPE_DISPLAY: Record<VisitType, string> = {
  Initial: "Initial",
  "Follow-up": "Follow-up",
  Review: "Review",
  Emergency: "Emergency",
  Clinic: "Clinic",
  Home: "Home visit",
};

export function visitTypeDisplay(v: VisitType): string {
  return VISIT_TYPE_DISPLAY[v] ?? v;
}

// status -> badge modifier class, matching the template conditionals.
export function badgeClass(status: Status): string {
  switch (status) {
    case "Completed":
      return "badge-completed";
    case "Confirmed":
      return "badge-active";
    case "Cancelled":
      return "badge-archived";
    case "Rescheduled":
    case "Reschedule Requested":
      return "badge-rescheduled";
    case "Pending":
    default:
      return "badge-pending";
  }
}
