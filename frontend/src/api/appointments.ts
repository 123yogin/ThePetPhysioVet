import { http } from '../lib/http';
import { Appointment, DashboardStats } from '../lib/types';

export async function fetchDashboardStats(): Promise<DashboardStats> {
  return http<DashboardStats>('/dashboard/stats');
}

export async function fetchAppointments(params?: {
  pet?: number;
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
  pet: number;
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

export async function fetchAppointmentDetail(id: number): Promise<Appointment> {
  return http<Appointment>(`/appointments/${id}`);
}

export async function rescheduleAppointment(
  id: number,
  data: { date: string; time: string }
): Promise<Appointment> {
  return http<Appointment>(`/appointments/${id}/reschedule`, {
    method: 'POST',
    data,
  });
}

export async function completeAppointment(id: number): Promise<Appointment> {
  return http<Appointment>(`/appointments/${id}/complete`, {
    method: 'POST',
  });
}

export async function approveReschedule(id: number): Promise<Appointment> {
  return http<Appointment>(`/appointments/${id}/reschedule-approve`, {
    method: 'POST',
  });
}

export async function rejectReschedule(id: number): Promise<Appointment> {
  return http<Appointment>(`/appointments/${id}/reschedule-reject`, {
    method: 'POST',
  });
}

export async function fetchShareAppointment(id: number): Promise<any> {
  return http(`/appointments/${id}/share`);
}
