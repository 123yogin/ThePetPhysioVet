// Owner↔Doctor query hooks (SRS §3.9). SHARED spine for the Sprint 7 (B) query
// screens: import these hooks/types — the doctor-side inbox + thread screens are
// the fan-out tasks that consume them. Reads go through the JSON api() wrapper;
// the reply send goes through apiUpload (multipart, repeated 'attachments').
//
// Query-key convention (matches the contract's invalidation keys exactly):
//   ["queryInbox"]            — the doctor's inbox list
//   ["queryThread", petId]    — one pet's append-only thread
// Sending a reply invalidates BOTH so the thread gains the new message and the
// inbox row (last_message / awaiting_reply / count) refreshes without a reload.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiUpload } from "../lib/http";
import type { InboxItem, QueryThread, ThreadMessage } from "../lib/types";

// GET /queries/inbox → { results: InboxItem[] }. Reads data.results (the
// contract's documented envelope) and hands the screen a plain array.
interface RawInbox {
  results: InboxItem[];
}

export function useQueryInbox() {
  return useQuery<RawInbox, Error, InboxItem[]>({
    queryKey: ["queryInbox"],
    queryFn: () => api<RawInbox>("/queries/inbox"),
    select: (raw) => raw.results,
  });
}

// GET /pets/{id}/queries → the pet's full thread (pet header + messages
// oldest→newest). Disabled until a valid pet id is supplied.
export function usePetQueryThread(petId: number) {
  return useQuery<QueryThread>({
    queryKey: ["queryThread", petId],
    queryFn: () => api<QueryThread>(`/pets/${petId}/queries`),
    enabled: Number.isFinite(petId),
  });
}

export interface SendQueryReplyVars {
  message: string;
  // 0–5 images (JPEG/PNG, ≤5MB each); validated + rejected atomically server-side.
  attachments?: File[];
  onProgress?: (percent: number) => void;
}

// POST /pets/{id}/queries — multipart: `message` + repeated `attachments` field
// (one append per file). sender/sender_role are set server-side to the calling
// doctor (never sent from the body). Returns the created ThreadMessage (201).
export function useSendQueryReply(petId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: SendQueryReplyVars) => {
      const fd = new FormData();
      fd.append("message", vars.message);
      for (const file of vars.attachments ?? []) {
        fd.append("attachments", file);
      }
      return apiUpload<ThreadMessage>(`/pets/${petId}/queries`, fd, {
        onProgress: vars.onProgress,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["queryThread", petId] });
      qc.invalidateQueries({ queryKey: ["queryInbox"] });
    },
  });
}
