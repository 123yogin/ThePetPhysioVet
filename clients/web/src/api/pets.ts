// Pet (patient) hooks under /pets.

import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../lib/http";
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
  pet_type: string;
  owner_name: string;
  owner_phone: string;
  notes?: string;
}

export function useCreatePet() {
  return useMutation({
    mutationFn: (payload: CreatePetPayload) =>
      api<Pet>("/pets", { method: "POST", body: payload }),
  });
}
