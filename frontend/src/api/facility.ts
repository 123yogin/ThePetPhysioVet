import { http } from '../lib/http';

/**
 * Indoor-facility (day-care) slot bookings — doctor side.
 *
 * The public site holds slots; this is where the clinic sees and actions them.
 * A booking is 1-3 slots sharing a reference, so the API returns them already
 * grouped (one card per visitor request), and confirm/cancel act on the whole
 * reference at once.
 */

export interface FacilitySlot {
  slot: number;
  label: string;
  status: string;
}

export interface FacilityBookingGroup {
  reference: string;
  date: string;
  pet_name: string;
  owner_name: string;
  owner_phone: string;
  owner_email: string;
  note: string;
  status: string;
  created_at: string;
  slots: FacilitySlot[];
}

export interface FacilityBookingsResponse {
  results: FacilityBookingGroup[];
  pending_count: number;
}

/** Shared key so the sidebar badge and the screen warm one cache entry. */
export function facilityQueryKey(date?: string, status?: string) {
  return ['facility-bookings', date ?? 'ALL', status ?? 'ALL'] as const;
}

export async function fetchFacilityBookings(
  date?: string,
  status?: string,
): Promise<FacilityBookingsResponse> {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (status) params.set('status', status);
  const query = params.toString();
  return http<FacilityBookingsResponse>(`/facility/bookings${query ? `?${query}` : ''}`);
}

export async function updateFacilityBookingStatus(
  reference: string,
  status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED',
): Promise<{ reference: string; status: string; slots_updated: number }> {
  return http(`/facility/bookings/${encodeURIComponent(reference)}/status`, {
    method: 'POST',
    data: { status },
  });
}
