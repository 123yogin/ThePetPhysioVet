/** The clinic is in India: "today" is the Asia/Kolkata calendar date, whatever the device's zone. */
export function todayISO(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}
