/** Zero-pad to two digits: 3 -> "03". */
export const pad2 = (n: number) => String(n).padStart(2, '0');

/** Indian-grouped rupee amount: 100000 -> "₹1,00,000". */
export const rupee = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/**
 * The day a boarded pet goes home (live QA D4). The API's `check_out` is the
 * stay's inclusive LAST NIGHT (what bed capacity counts), so a 24-hour stay
 * from the 8th has check_out = the 8th and goes home on the 9th; a stay shorter
 * than a day goes home the day it starts. Display only.
 */
export function boardingHomeDate(checkIn: string, checkOut: string, duration: string): string {
  const sub = /^(\d+)h$/.exec(duration || '');
  if (sub && Number(sub[1]) < 24) return checkIn;
  const [y, m, d] = checkOut.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** "2026-10-09" -> "Fri, 9 Oct" (calendar date, no zone shift). */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

/**
 * "Last night: Sat, 21 Nov · Goes home: Sun, 22 Nov" -- spells out both ends of
 * a stay, since the API's `check_out` is the last bed-night, not the pickup day.
 * A stay shorter than a night has no overnight, so it reads "Same-day stay".
 */
export function stayDatesLabel(checkIn: string, checkOut: string, duration: string): string {
  const home = boardingHomeDate(checkIn, checkOut, duration);
  if (home === checkIn) return `Same-day stay · Goes home: ${shortDate(home)}`;
  return `Last night: ${shortDate(checkOut)} · Goes home: ${shortDate(home)}`;
}
