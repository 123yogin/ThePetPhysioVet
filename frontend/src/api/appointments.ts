import { http } from '../lib/http';
import { Appointment, DashboardStats } from '../lib/types';

export async function fetchDashboardStats(): Promise<DashboardStats> {
  return http<DashboardStats>('/dashboard/stats');
}

export async function fetchAppointments(params?: {
  pet?: string;
  owner?: string;
  date?: string;
}): Promise<Appointment[]> {
  const query = new URLSearchParams();
  if (params?.pet) query.set('pet', String(params.pet));
  if (params?.owner) query.set('owner', params.owner);
  if (params?.date) query.set('date', params.date);

  const url = `/appointments${query.toString() ? '?' + query.toString() : ''}`;
  return http<Appointment[]>(url);
}

export async function createAppointment(data: {
  pet: string;
  visit_type: string;
  date: string;
  time: string;
  reason_notes?: string;
}): Promise<Appointment> {
  return http<Appointment>('/appointments', {
    method: 'POST',
    data,
  });
}

export async function fetchAppointmentDetail(id: string): Promise<Appointment> {
  return http<Appointment>(`/appointments/${id}`);
}

export async function rescheduleAppointment(
  id: string,
  data: { date: string; time: string }
): Promise<Appointment> {
  return http<Appointment>(`/appointments/${id}/reschedule`, {
    method: 'POST',
    data,
  });
}

export async function completeAppointment(id: string): Promise<Appointment> {
  return http<Appointment>(`/appointments/${id}/complete`, {
    method: 'POST',
  });
}

export async function approveReschedule(id: string): Promise<Appointment> {
  return http<Appointment>(`/appointments/${id}/reschedule-approve`, {
    method: 'POST',
  });
}

export async function rejectReschedule(id: string): Promise<Appointment> {
  return http<Appointment>(`/appointments/${id}/reschedule-reject`, {
    method: 'POST',
  });
}

export async function fetchShareAppointment(id: string): Promise<any> {
  return http(`/appointments/${id}/share`);
}

/**
 * The single source of truth for bookable visit types.
 *
 * Three booking forms previously hardcoded three different vocabularies, and
 * none of them matched the database — every option on both owner forms and
 * three of the doctor's four were rejected with HTTP 400. Fetch the list
 * instead of retyping it, and the forms cannot drift again.
 */
export async function fetchAppointmentOptions(): Promise<{
  visit_types: { value: string; label: string }[];
}> {
  return http('/appointment-options');
}

/** Pending -> Confirmed. Owner-requested bookings had no way out of Pending. */
export async function confirmAppointment(id: string): Promise<Appointment> {
  return http<Appointment>(`/appointments/${id}/confirm`, { method: 'POST' });
}
