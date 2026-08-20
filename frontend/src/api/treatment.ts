import { http } from '../lib/http';
import { TreatmentPlan, ProgressNote } from '../lib/types';

export async function fetchPetTreatmentPlans(petId: number): Promise<TreatmentPlan[]> {
  return http<TreatmentPlan[]>(`/pets/${petId}/treatment-plans`);
}

export async function createTreatmentPlan(petId: number, data: any): Promise<TreatmentPlan> {
  return http<TreatmentPlan>(`/pets/${petId}/treatment-plans`, {
    method: 'POST',
    data,
  });
}

export async function fetchTreatmentPlanDetail(id: number): Promise<TreatmentPlan> {
  return http<TreatmentPlan>(`/treatment-plans/${id}`);
}

export async function addProgressNote(planId: number, data: { session_no?: number; notes: string }): Promise<ProgressNote> {
  return http<ProgressNote>(`/treatment-plans/${planId}/progress-notes`, {
    method: 'POST',
    data,
  });
}
