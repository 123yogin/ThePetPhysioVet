/**
 * Shared booking helpers — the clinic API base URL and the local-date formatter
 * were copy-pasted across every booking subform (BookingForm,
 * FacilitySlotBooking, IndoorFacilityBooking, ServiceRequestBooking) and the
 * usePublicServiceCodes hook. Defined once here so they can't drift.
 */

/** Base path for the clinic API. Overridable at build time; same-origin by default. */
export const CLINIC_API = (import.meta as any).env?.VITE_CLINIC_API_URL ?? '/api/v1';

/** The clinic is in India: "today" is always the Asia/Kolkata calendar date, whatever the visitor's zone. */
const CLINIC_TZ = 'Asia/Kolkata';

/** Clinic (IST) calendar date `offsetDays` from today, as `YYYY-MM-DD`. */
export function isoDate(offsetDays = 0): string {
  // en-CA formats as YYYY-MM-DD.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ }).format(new Date());
  const [y, m, d] = today.split('-').map(Number);
  // Pure UTC calendar arithmetic, so the visitor's zone/DST cannot shift the day.
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
}

/**
 * POST an enquiry to the clinic's /enquiries pipeline and return the created
 * record. The clinic API speaks RFC-7807, so on failure we surface `detail` (a
 * real sentence) rather than a generic message. Shared by BookingForm and
 * ServiceRequestBooking, which both feed the same pipeline.
 */
export async function postEnquiry(payload: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${CLINIC_API}/enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.detail || 'We could not send your enquiry. Please try again.');
  }
  return body;
}
