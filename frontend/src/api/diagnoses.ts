import { http } from '../lib/http';
import { Diagnosis } from '../lib/types';

export async function fetchPetDiagnoses(petId: number): Promise<Diagnosis[]> {
  return http<Diagnosis[]>(`/pets/${petId}/diagnoses`);
}

export async function createDiagnosis(petId: number, formData: FormData): Promise<Diagnosis> {
  return http<Diagnosis>(`/pets/${petId}/diagnoses`, {
    method: 'POST',
    data: formData,
  });
}

export async function deleteDiagnosis(id: number): Promise<void> {
  return http(`/diagnoses/${id}`, { method: 'DELETE' });
}
