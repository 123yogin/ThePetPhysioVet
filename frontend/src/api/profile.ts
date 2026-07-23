// Account/profile hooks (GET/PATCH /auth/profile). Works for both roles — the
// server returns/accepts the role-appropriate fields. Invalidates ["me"] on
// save so the shell (clinic name etc.) reflects edits without a reload.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/http";
import type { Profile } from "../lib/types";

export function useProfile() {
  return useQuery<Profile>({
    queryKey: ["profile"],
    queryFn: () => api<Profile>("/auth/profile"),
  });
}

// Partial update; only send the fields the form edits.
export type ProfilePatch = Partial<
  Pick<
    Profile,
    "first_name" | "last_name" | "email" | "clinic_name" | "clinic_address" | "clinic_phone" | "phone"
  >
>;

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfilePatch) =>
      api<Profile>("/auth/profile", { method: "PATCH", body: patch }),
    onSuccess: (data) => {
      qc.setQueryData(["profile"], data);
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
