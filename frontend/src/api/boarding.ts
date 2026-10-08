import { http } from '../lib/http';
import type { Diagnosis } from '../lib/types';

/**
 * Indoor-facility BOARDING (duration-priced stays) — doctor side.
 *
 * The public site takes owner bookings; a doctor sees them here, can create one
 * themselves, and runs check-in. Price/check-out are derived server-side, so
 * this layer never computes money.
 */

export interface Boarding {
  id: string;
  reference: string;
  pet_name: string;
  owner_name: string;
  owner_phone: string;
  owner_email: string;
  check_in: string;
  check_out: string;
  duration: string;
  duration_label: string;
  price: number;
  food_by: string;
  utensils_by: string;
  medicines_by: string;
  blanket_by: string;
  food_preference: string;
  walk_times: string[];
  aadhaar: string;
  terms_accepted: boolean;
  status: string;
  source: string;
  created_at: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  owner_id?: string | null;
  pet_id?: string | null;
  pet_link_status?: 'linked' | 'owner_only' | 'unlinked';
  /** True once staff pressed "Confirm client", convert created the account, or
   *  the owner booked signed in. A phone/email match is false — a hint only. */
  owner_verified?: boolean;
  /** The linked account, so staff can check it before confirming. */
  owner_account?: { id: string; name: string; email: string; phone: string } | null;
  /** null when no pet is linked; [] when the pet belongs to another practice. */
  previous_reports?: Diagnosis[] | null;
  /** True only when the linked pet belongs to another doctor (the [] means "not yours to see"). */
  previous_reports_restricted?: boolean;
}

export interface BoardingListResponse {
  results: Boarding[];
  pending_count: number;
}

export interface BoardingDuration { key: string; label: string; days: number; price: number }
export interface BoardingWalkOption { key: string; label: string; minutes: number }
export interface BoardingMenu {
  capacity: number;
  durations: BoardingDuration[];
  walk_options: BoardingWalkOption[];
  selection?: {
    check_in: string; duration: string; duration_label: string;
    check_out: string; price: number; available: number;
  };
}

export type BoardingAction = 'confirm' | 'check_in' | 'complete' | 'cancel';

export function boardingQueryKey(status?: string) {
  return ['boarding', status ?? 'ALL'] as const;
}

export async function fetchBoardings(status?: string): Promise<BoardingListResponse> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const qs = params.toString();
  const query = qs ? `?${qs}` : '';
  return http<BoardingListResponse>(`/facility/boarding${query}`);
}

/** Checked-in stays about to end (within 15 min) or overdue — for the clinic's
    "ending soon" alert. */
export interface BoardingEndingSoon {
  reference: string;
  pet_name: string;
  owner_name: string;
  owner_phone: string;
  duration_label: string;
  ends_at: string;
  minutes_left: number;
  overdue: boolean;
}
export interface BoardingEndingSoonResponse {
  results: BoardingEndingSoon[];
  count: number;
}

export function boardingEndingSoonQueryKey() {
  return ['boarding-ending-soon'] as const;
}

export async function fetchBoardingEndingSoon(): Promise<BoardingEndingSoonResponse> {
  return http<BoardingEndingSoonResponse>('/facility/boarding/ending-soon');
}

export async function fetchBoardingMenu(checkIn?: string, duration?: string): Promise<BoardingMenu> {
  const params = new URLSearchParams();
  if (checkIn) params.set('check_in', checkIn);
  if (duration) params.set('duration', duration);
  const qs = params.toString();
  const query = qs ? `?${qs}` : '';
  return http<BoardingMenu>(`/facility/boarding/availability${query}`);
}

export async function updateBoardingStatus(
  reference: string,
  action: BoardingAction,
  intake?: Record<string, string>,
) {
  return http<{ reference: string; status: string }>(
    `/facility/boarding/${encodeURIComponent(reference)}/status`,
    { method: 'POST', data: { action, ...(intake ?? {}) } },
  );
}

export async function createBoarding(payload: Record<string, unknown>) {
  return http<{ reference: string; status: string; price: number }>(`/facility/boarding`, {
    method: 'POST',
    data: payload,
  });
}

/** Find-or-create the owner + pet for a stay and link them (idempotent). */
/** Staff have checked the linked account is this client: show the stay in
 *  that owner's app. */
export async function confirmBoardingClient(reference: string) {
  return http<Boarding>(`/facility/boarding/${encodeURIComponent(reference)}/confirm-client`, {
    method: 'POST',
  });
}

export async function convertBoarding(reference: string) {
  return http<Boarding>(`/facility/boarding/${encodeURIComponent(reference)}/convert`, {
    method: 'POST',
  });
}
