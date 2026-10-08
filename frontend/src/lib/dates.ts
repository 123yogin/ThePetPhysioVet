/** The clinic is in India: "today" is the Asia/Kolkata calendar date, whatever the device's zone. */
export function todayISO(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

// Clinic day for booking defaults: first slot 09:00, last one starting 17:00.
const CLINIC_FIRST_HOUR = 9;
const CLINIC_LAST_HOUR = 17;

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Default date/time for "Confirm & Book". A preferred date in the future keeps
 * the usual 10:00. Today (or a preferred date that has already passed) gets the
 * next whole hour inside clinic hours; once today is over, tomorrow's first
 * slot -- never a time that is already in the past. `now` is injectable for tests.
 */
export function nextFreeSlot(preferredDate?: string | null, now: Date = new Date()): { date: string; time: string } {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
  if (preferredDate && preferredDate > today) return { date: preferredDate, time: '10:00' };
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23',
  }).format(now);
  const nextHour = Number(parts) + 1;
  const pad = (h: number) => `${String(h).padStart(2, '0')}:00`;
  if (nextHour <= CLINIC_FIRST_HOUR) return { date: today, time: pad(CLINIC_FIRST_HOUR) };
  if (nextHour <= CLINIC_LAST_HOUR) return { date: today, time: pad(nextHour) };
  return { date: addDaysISO(today, 1), time: pad(CLINIC_FIRST_HOUR) };
}
