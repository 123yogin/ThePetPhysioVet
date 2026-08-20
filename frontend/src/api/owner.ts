import { http } from '../lib/http';
import { Pet, Appointment, Invoice, QueryThread, QueryMessage, Diagnosis, TreatmentPlan } from '../lib/types';

export async function fetchOwnerPets(): Promise<Pet[]> {
  return http<Pet[]>('/owner/pets');
}

export async function createOwnerPet(formData: FormData): Promise<Pet> {
  return http<Pet>('/owner/pets', {
    method: 'POST',
    data: formData,
  });
}

export async function createOwnerAppointment(data: {
  pet_id: number;
  date: string;
  time: string;
  visit_type: string;
  reason_notes?: string;
}): Promise<Appointment> {
  return http<Appointment>('/owner/appointments', {
    method: 'POST',
    data,
  });
}

export async function fetchOwnerPetDetail(
  id: number
): Promise<Pet & { diagnoses: Diagnosis[]; treatment_plans: TreatmentPlan[] }> {
  return http(`/owner/pets/${id}`);
}

export async function addOwnerPetDiagnosis(petId: number, formData: FormData): Promise<Diagnosis> {
  return http<Diagnosis>(`/owner/pets/${petId}/diagnoses`, {
    method: 'POST',
    data: formData,
  });
}

export async function updateOwnerPetHistory(petId: number, data: {
  medical_history?: string;
  complaint?: string;
  notes?: string;
  age?: string;
  weight?: string;
}): Promise<Pet> {
  return http(`/owner/pets/${petId}/history`, {
    method: 'POST',
    data,
  });
}

export async function fetchOwnerAppointments(): Promise<Appointment[]> {
  return http<Appointment[]>('/owner/appointments');
}

export async function acceptOwnerAppointment(id: number): Promise<Appointment> {
  return http<Appointment>(`/owner/appointments/${id}/accept`, { method: 'POST' });
}

export async function requestOwnerReschedule(id: number, data: { date: string; time: string; reason: string }): Promise<Appointment> {
  return http<Appointment>(`/owner/appointments/${id}/reschedule-request`, {
    method: 'POST',
    data,
  });
}

export async function fetchOwnerInvoices(): Promise<Invoice[]> {
  return http<Invoice[]>('/owner/invoices');
}

export async function fetchOwnerQueries(petId: number): Promise<QueryThread> {
  return http<QueryThread>(`/owner/pets/${petId}/queries`);
}

export async function sendOwnerQueryMessage(petId: number, formData: FormData): Promise<QueryMessage> {
  return http<QueryMessage>(`/owner/pets/${petId}/queries`, {
    method: 'POST',
    data: formData,
  });
}
