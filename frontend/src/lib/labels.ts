/**
 * Turn a backend enum into something a person reads.
 *
 * The API sends database enums verbatim — `PARTIALLY_PAID`, `RESCHEDULE_REQUESTED`.
 * Rendering those directly leaks the schema into the UI: a clinician sees
 * "PARTIALLY_PAID" where they expect "Partially Paid".
 *
 * Kept deliberately dumb: underscores to spaces, Title Case. No lookup map, so a
 * status the backend adds later still renders sensibly instead of falling through
 * to a blank or a raw enum.
 */
export function humanizeStatus(value?: string | null): string {
  if (!value) return '—';
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
