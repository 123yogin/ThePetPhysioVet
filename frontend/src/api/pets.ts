// Pet (patient) hooks under /pets.

import { useMutation, useQuery } from "@tanstack/react-query";
import { api, apiUpload } from "../lib/http";
import type { Pet } from "../lib/types";

// Django's patient_list filters q against pet name OR owner name (icontains);
// rows come back in Pet.Meta name order.
export function usePets(q?: string) {
  return useQuery<Pet[]>({
    queryKey: ["pets", q ?? ""],
    queryFn: () => api<Pet[]>("/pets", { params: { q } }),
  });
}

export interface CreatePetPayload {
  name: string;
  species?: string;
  pet_type?: string;
  breed?: string;
  age?: string;
  sex?: string;
  weight?: string;
  owner_name: string;
  owner_phone: string;
  owner_email?: string;
  medical_history?: string;
  complaint?: string;
  complaint_started?: string;
  referred_by?: string;
  notes?: string;
  // Sprint 8 (§3.3 / AC-02): optional pet photo. When a File is chosen the
  // create posts multipart/form-data (the backend resizes to 800×800 on save);
  // when absent, no 'photo' key is sent so the field stays optional.
  photo?: File | null;
}

// Every create posts multipart/form-data via apiUpload: text fields are appended
// as strings and 'photo' is appended only when a File is present. The backend
// accepts both multipart and JSON, so a single FormData path is safe and keeps
// the photo-optional AC (no 'photo' key when none chosen). apiUpload omits
// Content-Type so the browser sets the multipart boundary, and carries
// CSRF + Bearer + 401-refresh exactly like api().
export function useCreatePet() {
  return useMutation({
    mutationFn: (payload: CreatePetPayload) => {
      const { photo, ...fields } = payload;
      const fd = new FormData();
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined && value !== null) fd.append(key, String(value));
      }
      if (photo instanceof File) fd.append("photo", photo);
      return apiUpload<Pet>("/pets", fd);
    },
  });
}
