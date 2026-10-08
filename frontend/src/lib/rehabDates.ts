/** Date helpers for the rehab checklist. All inputs are YYYY-MM-DD calendar dates. */

export function parseISO(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysISO(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

export function dateRange(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  let cur = startISO;
  // Hard cap mirrors the backend's 366-day plan limit.
  while (cur <= endISO && out.length < 400) {
    out.push(cur);
    cur = addDaysISO(cur, 1);
  }
  return out;
}

export function weekdayShort(iso: string): string {
  return parseISO(iso).toLocaleDateString('en-IN', { weekday: 'short' });
}

export function dayMonth(iso: string): string {
  return parseISO(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function longDate(iso: string): string {
  return parseISO(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
