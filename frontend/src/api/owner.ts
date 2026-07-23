// Owner-portal hooks (SRS §3.1 owner side). The owner sees ONLY their own pets
// (backend scopes by Pet.owner == request.user; AC-04).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiUpload } from "../lib/http";
import type {
  Appointment,
  Pet,
  Diagnosis,
  TreatmentPlan,
  Invoice,
  InvoiceDetail,
  QueryThread,
  ThreadMessage,
} from "../lib/types";

// Owner pet detail = the pet header + its read-only clinical record.
export interface OwnerPetDetail extends Pet {
  diagnoses: Diagnosis[];
  treatment_plans: TreatmentPlan[];
}

export function useOwnerPets() {
  return useQuery<Pet[]>({
    queryKey: ["owner", "pets"],
    queryFn: () => api<Pet[]>("/owner/pets"),
  });
}

export function useOwnerPetDetail(id: number) {
  return useQuery<OwnerPetDetail>({
    queryKey: ["owner", "pet", id],
    queryFn: () => api<OwnerPetDetail>(`/owner/pets/${id}`),
    enabled: Number.isFinite(id),
  });
}

// Activate a doctor-provisioned owner account by setting a password (the claim
// step). No auth required (the account exists but has no usable password yet).
export function useOwnerSetPassword() {
  return useMutation({
    mutationFn: (payload: { email: string; password: string }) =>
      api<{ ok: boolean }>("/auth/owner-set-password", { method: "POST", body: payload }),
  });
}

// ----- Owner appointments (SRS §3.6 owner side) -----
export function useOwnerAppointments() {
  return useQuery<Appointment[]>({
    queryKey: ["owner", "appointments"],
    queryFn: () => api<Appointment[]>("/owner/appointments"),
  });
}

// Owner accepts a pending appointment → Confirmed.
export function useOwnerAcceptAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api<Appointment>(`/owner/appointments/${id}/accept`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", "appointments"] }),
  });
}

// Owner requests a reschedule (new date/time + reason).
export function useOwnerRescheduleRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; date: string; time: string; reason: string }) =>
      api<Appointment>(`/owner/appointments/${vars.id}/reschedule-request`, {
        method: "POST",
        body: { date: vars.date, time: vars.time, reason: vars.reason },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", "appointments"] }),
  });
}

// ----- Owner billing (SRS §3.8 owner side) -----
export function useOwnerInvoices() {
  return useQuery<Invoice[]>({
    queryKey: ["owner", "invoices"],
    queryFn: () => api<Invoice[]>("/owner/invoices"),
  });
}

export function useOwnerInvoice(id: number) {
  return useQuery<InvoiceDetail>({
    queryKey: ["owner", "invoice", id],
    queryFn: () => api<InvoiceDetail>(`/owner/invoices/${id}`),
    enabled: Number.isFinite(id),
  });
}

// Owner pays (full or partial) against an invoice → status re-derived server-side.
export function useOwnerPayInvoice(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (amount: number | string) =>
      api<InvoiceDetail>(`/owner/invoices/${id}/payments`, {
        method: "POST",
        body: { amount: String(amount) },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner", "invoice", id] });
      qc.invalidateQueries({ queryKey: ["owner", "invoices"] });
    },
  });
}

// Direct URL to the owner receipt PDF (fetched as a blob, not via api()).
export function ownerReceiptUrl(id: number): string {
  return `/api/v1/owner/invoices/${id}/receipt`;
}

// ----- Owner queries (SRS §3.9 owner side) -----
export function useOwnerQueryThread(petId: number) {
  return useQuery<QueryThread>({
    queryKey: ["owner", "queryThread", petId],
    queryFn: () => api<QueryThread>(`/owner/pets/${petId}/queries`),
    enabled: Number.isFinite(petId),
  });
}

export interface SendOwnerQueryVars {
  message: string;
  attachments?: File[];
}

// POST /owner/pets/{id}/queries — multipart; sender_role set to OWNER server-side.
export function useSendOwnerQuery(petId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: SendOwnerQueryVars) => {
      const fd = new FormData();
      fd.append("message", vars.message);
      for (const file of vars.attachments ?? []) fd.append("attachments", file);
      return apiUpload<ThreadMessage>(`/owner/pets/${petId}/queries`, fd);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", "queryThread", petId] }),
  });
}
