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

export interface ProgressNoteInput {
  session_no?: number;
  notes: string;
  pain_score?: number | null;
  lameness_score?: number | null;
  rom_joint?: string;
  rom_degrees?: string | null;
  girth_cm?: string | null;
}

export async function addProgressNote(planId: string, data: ProgressNoteInput): Promise<ProgressNote> {
  return http<ProgressNote>(`/treatment-plans/${planId}/progress-notes`, {
    method: 'POST',
    data,
  });
}
