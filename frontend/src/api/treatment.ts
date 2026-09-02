import { http } from '../lib/http';
import { TreatmentPlan, ProgressNote } from '../lib/types';

export async function fetchPetTreatmentPlans(petId: string): Promise<TreatmentPlan[]> {
  return http<TreatmentPlan[]>(`/pets/${petId}/treatment-plans`);
}

export async function createTreatmentPlan(petId: string, data: any): Promise<TreatmentPlan> {
  return http<TreatmentPlan>(`/pets/${petId}/treatment-plans`, {
    method: 'POST',
    data,
  });
}

export async function fetchTreatmentPlanDetail(id: string): Promise<TreatmentPlan> {
  return http<TreatmentPlan>(`/treatment-plans/${id}`);
}

export async function addProgressNote(planId: string, data: { session_no?: number; notes: string }): Promise<ProgressNote> {
  return http<ProgressNote>(`/treatment-plans/${planId}/progress-notes`, {
    method: 'POST',
    data,
  });
}
