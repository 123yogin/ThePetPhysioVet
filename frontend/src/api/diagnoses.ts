// Diagnosis + pet-detail hooks (SRS §3.4). Uploads go through apiUpload
// (multipart + progress); reads/delete go through the JSON api() wrapper.

import { useMutation, useQuery } from "@tanstack/react-query";
import { api, apiUpload } from "../lib/http";
import type { Diagnosis, PetDetail } from "../lib/types";

export function usePetDetail(petId: number) {
  return useQuery<PetDetail>({
    queryKey: ["pet", petId],
    queryFn: () => api<PetDetail>(`/pets/${petId}`),
    enabled: Number.isFinite(petId),
  });
}

export function useDiagnoses(petId: number) {
  return useQuery<Diagnosis[]>({
    queryKey: ["diagnoses", petId],
    queryFn: () => api<Diagnosis[]>(`/pets/${petId}/diagnoses`),
    enabled: Number.isFinite(petId),
  });
}

export function useDiagnosis(id: number) {
  return useQuery<Diagnosis>({
    queryKey: ["diagnosis", id],
    queryFn: () => api<Diagnosis>(`/diagnoses/${id}`),
    enabled: Number.isFinite(id),
  });
}

export interface UploadDiagnosisVars {
  file: File;
  report_type: string;
  notes: string; // sanitized server-side
  onProgress?: (percent: number) => void;
}

export function useUploadDiagnosis(petId: number) {
  return useMutation({
    mutationFn: (vars: UploadDiagnosisVars) => {
      const fd = new FormData();
      fd.append("report_type", vars.report_type);
      fd.append("notes", vars.notes);
      fd.append("file", vars.file);
      return apiUpload<Diagnosis>(`/pets/${petId}/diagnoses`, fd, {
        onProgress: vars.onProgress,
      });
    },
  });
}

export function useDeleteDiagnosis() {
  return useMutation({
    mutationFn: (id: number) => api<void>(`/diagnoses/${id}`, { method: "DELETE" }),
  });
}

export interface ReplaceDiagnosisVars {
  id: number;
  file: File;
  onProgress?: (percent: number) => void;
}

// Replace re-uses the same type + 20MB validation server-side and keeps the
// same row id (only file/original_filename/mime/size/uploaded_at change).
export function useReplaceDiagnosisFile() {
  return useMutation({
    mutationFn: (vars: ReplaceDiagnosisVars) => {
      const fd = new FormData();
      fd.append("file", vars.file);
      return apiUpload<Diagnosis>(`/diagnoses/${vars.id}/file`, fd, {
        method: "PATCH",
        onProgress: vars.onProgress,
      });
    },
  });
}
