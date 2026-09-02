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

/**
 * The right animal for the pet.
 *
 * 🐕 was hardcoded at eight call sites and only one screen checked the
 * species, so Luna — a cat — was drawn as a dog on the patient list, the
 * calendar, the inbox and her own owner's home screen.
 *
 * `species` is free text typed by staff ("Dog", "dog", "Cat"), so match
 * loosely and fall back to a paw rather than guessing an animal.
 */
export function petEmoji(species?: string | null): string {
  const s = (species || '').toLowerCase();
  if (s.includes('cat')) return '🐈';
  if (s.includes('dog')) return '🐕';
  if (s.includes('bird') || s.includes('parrot')) return '🐦';
  if (s.includes('rabbit') || s.includes('bunny')) return '🐇';
  if (s.includes('horse')) return '🐎';
  return '🐾';
}

/**
 * Dates a person can read at a glance.
 *
 * Owners were shown raw ISO strings — "2026-09-14 @ 14:30" — for the single
 * question they open the app to answer: when is my pet seen next?
 */
export function friendlyDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(d) - startOf(today)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  const label = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  if (days > 1 && days <= 7) return `${label} (in ${days} days)`;
  return label;
}

/** "14:30:00" -> "2:30pm". Owners should not have to parse 24h seconds. */
export function friendlyTime(t?: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hour = Number(h);
  if (Number.isNaN(hour)) return t;
  const suffix = hour < 12 ? 'am' : 'pm';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m}${suffix}`;
}
