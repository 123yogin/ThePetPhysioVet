import { http } from '../lib/http';
import { Diagnosis } from '../lib/types';

export async function fetchPetDiagnoses(petId: string): Promise<Diagnosis[]> {
  return http<Diagnosis[]>(`/pets/${petId}/diagnoses`);
}

export async function createDiagnosis(petId: string, formData: FormData): Promise<Diagnosis> {
  return http<Diagnosis>(`/pets/${petId}/diagnoses`, {
    method: 'POST',
    data: formData,
  });
}

export async function deleteDiagnosis(id: string): Promise<void> {
  return http(`/diagnoses/${id}`, { method: 'DELETE' });
}
