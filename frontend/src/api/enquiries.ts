import { http } from '../lib/http';
import { Enquiry, EnquiriesResponse } from '../lib/types';

/**
 * Shared React Query key builder for the enquiries list.
 *
 * The sidebar badge and the Enquiries screen both need `new_count`. Rather
 * than have the sidebar fetch it separately, both call `fetchEnquiries` with
 * the same `status` and therefore land on the same cache entry — one request
 * warms both, and either invalidates the other on convert/dismiss.
 */
export function enquiriesQueryKey(status?: string) {
  return ['enquiries', status ?? 'ALL'] as const;
}

export async function fetchEnquiries(status?: string): Promise<EnquiriesResponse> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return http<EnquiriesResponse>(`/enquiries${query}`);
}

export async function convertEnquiry(
  id: string,
  data: { date: string; time: string; visit_type: string }
): Promise<Enquiry> {
  return http<Enquiry>(`/enquiries/${id}/convert`, {
    method: 'POST',
    data,
  });
}

export async function dismissEnquiry(id: string): Promise<Enquiry> {
  return http<Enquiry>(`/enquiries/${id}/dismiss`, {
    method: 'POST',
  });
}
