import { http } from '../lib/http';
import {
  TreatmentPlan,
  ProgressNote,
  ScheduleEntry,
  RehabCatalogue,
  RehabToday,
  RehabSession,
} from '../lib/types';

export async function fetchPetTreatmentPlans(petId: string): Promise<TreatmentPlan[]> {
  return http<TreatmentPlan[]>(`/pets/${petId}/treatment-plans`);
}

export async function createTreatmentPlan(petId: string, data: any): Promise<TreatmentPlan> {
  return http<TreatmentPlan>(`/pets/${petId}/treatment-plans`, {
    method: 'POST',
    data,
  });
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

// ---- Rehab checklist ----

export interface TreatmentPlanInput {
  therapies?: string[];
  schedule?: ScheduleEntry[];
  start_date?: string;
  end_date?: string | null;
  status?: string;
}

export async function updateTreatmentPlan(planId: string, data: TreatmentPlanInput): Promise<TreatmentPlan> {
  return http<TreatmentPlan>(`/treatment-plans/${planId}`, { method: 'PATCH', data });
}

export async function extendTreatmentPlan(planId: string, days = 7): Promise<TreatmentPlan> {
  return http<TreatmentPlan>(`/treatment-plans/${planId}/extend`, { method: 'POST', data: { days } });
}

export const rehabCatalogueKey = ['rehabCatalogue'] as const;
export const rehabTodayKey = ['rehabToday'] as const;

export async function fetchRehabCatalogue(): Promise<RehabCatalogue> {
  return http<RehabCatalogue>('/rehab/therapies');
}

export async function fetchRehabToday(): Promise<RehabToday> {
  return http<RehabToday>('/rehab/today');
}

export async function markSessionDone(id: string, doneOn?: string): Promise<RehabSession> {
  return http<RehabSession>(`/rehab/sessions/${id}/done`, {
    method: 'POST',
    data: doneOn ? { done_on: doneOn } : {},
  });
}

export async function skipSession(id: string, reason: string): Promise<RehabSession> {
  return http<RehabSession>(`/rehab/sessions/${id}/skip`, { method: 'POST', data: { reason } });
}

export async function undoSession(id: string): Promise<RehabSession> {
  return http<RehabSession>(`/rehab/sessions/${id}/undo`, { method: 'POST', data: {} });
}
