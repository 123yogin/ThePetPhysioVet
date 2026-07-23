// Treatment-plan + progress-note hooks (SRS §3.5). All JSON via api().

import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../lib/http";
import type {
  ProgressNote,
  TreatmentPlan,
  TreatmentPlanDetail,
} from "../lib/types";

export function useTreatmentPlans(petId: number) {
  return useQuery<TreatmentPlan[]>({
    queryKey: ["treatment-plans", petId],
    queryFn: () => api<TreatmentPlan[]>(`/pets/${petId}/treatment-plans`),
    enabled: Number.isFinite(petId),
  });
}

export function useTreatmentPlan(id: number) {
  return useQuery<TreatmentPlanDetail>({
    queryKey: ["treatment-plan", id],
    queryFn: () => api<TreatmentPlanDetail>(`/treatment-plans/${id}`),
    enabled: Number.isFinite(id),
  });
}

export interface PlanPayload {
  therapies: string[];
  frequency: string;
  frequency_custom?: string;
  duration: string;
  duration_custom?: string;
  start_date: string;
  end_date?: string | null;
  status: string;
}

export function useCreatePlan(petId: number) {
  return useMutation({
    mutationFn: (payload: PlanPayload) =>
      api<TreatmentPlan>(`/pets/${petId}/treatment-plans`, {
        method: "POST",
        body: payload,
      }),
  });
}

export function useUpdatePlan(id: number) {
  return useMutation({
    mutationFn: (payload: Partial<PlanPayload>) =>
      api<TreatmentPlan>(`/treatment-plans/${id}`, {
        method: "PATCH",
        body: payload,
      }),
  });
}

export interface AddNoteVars {
  session_no: number;
  notes: string; // sanitized server-side; must be non-empty
}

export function useAddProgressNote(planId: number) {
  return useMutation({
    mutationFn: (vars: AddNoteVars) =>
      api<ProgressNote>(`/treatment-plans/${planId}/progress-notes`, {
        method: "POST",
        body: vars,
      }),
  });
}
