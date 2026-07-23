// Appointment hooks under /appointments.
//
// NORMALIZATION LAYER (the one real design decision): DRF's AppointmentSerializer
// emits `date` as ISO "YYYY-MM-DD" and `time` as "HH:MM:SS", but the screens
// render `a.date` / `a.time` RAW and pixel-parity requires Django's filter
// output ("July 22, 2026", "9:30 a.m."). So every read hook maps the raw row
// through lib/format.ts in React Query's `select`, producing the SAME display
// strings the deleted mock produced — screens & markup stay byte-identical.
// Serializers keep emitting raw values (no display strings muddying the JSON).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/http";
import { dateMedium, formatTime } from "../lib/format";
import type {
  Appointment,
  AppointmentDetail,
  DashboardAppointment,
  DashboardStats,
  SharePayload,
} from "../lib/types";

// Raw rows as DRF serialises them (date ISO "YYYY-MM-DD", time "HH:MM:SS").
interface RawAppointment extends Omit<Appointment, "date" | "time"> {
  date: string;
  time: string;
}
interface RawDashboardAppointment extends Omit<DashboardAppointment, "time"> {
  date: string;
  time: string;
}

// Map one raw row to the display shape the screens render, preserving any extra
// fields (e.g. dashboard's pet_type) and exposing the raw ISO date + 24h time
// for form pre-fill (reschedule inputs).
function normalizeAppointment<T extends { date: string; time: string }>(
  raw: T,
): T & { date_iso: string; time_24h: string } {
  const time_24h = raw.time.slice(0, 5);
  return {
    ...raw,
    date: dateMedium(raw.date),
    time: formatTime(time_24h),
    date_iso: raw.date,
    time_24h,
  };
}

interface RawDashboardStats extends Omit<DashboardStats, "today_appointments"> {
  today_appointments: RawDashboardAppointment[];
}

export function useDashboard() {
  return useQuery<RawDashboardStats, Error, DashboardStats>({
    queryKey: ["dashboard"],
    queryFn: () => api<RawDashboardStats>("/dashboard/stats"),
    // today_display comes verbatim from the API ('l, F j, Y'); only the per-row
    // time needs normalising for the dashboard cards.
    select: (raw) => ({
      ...raw,
      today_appointments: raw.today_appointments.map(normalizeAppointment),
    }),
  });
}

export interface ApptFilters {
  pet?: string;
  owner?: string;
  date?: string;
}

export function useAppointments(filters: ApptFilters) {
  return useQuery<RawAppointment[], Error, Appointment[]>({
    queryKey: ["appointments", filters],
    queryFn: () =>
      api<RawAppointment[]>("/appointments", {
        params: { pet: filters.pet, owner: filters.owner, date: filters.date },
      }),
    select: (rows) => rows.map(normalizeAppointment),
  });
}

export function useAppointment(id: number) {
  return useQuery<RawAppointment, Error, AppointmentDetail>({
    queryKey: ["appointment", id],
    queryFn: () => api<RawAppointment>(`/appointments/${id}`),
    select: normalizeAppointment,
  });
}

export function useShare(id: number) {
  return useQuery<SharePayload>({
    queryKey: ["share", id],
    queryFn: () => api<SharePayload>(`/appointments/${id}/share`),
  });
}

export interface CreateApptPayload {
  pet: number;
  visit_type: string;
  date: string;
  time: string;
  reason_notes?: string;
}

export function useCreateAppointment() {
  return useMutation({
    mutationFn: (payload: CreateApptPayload) =>
      api<RawAppointment>("/appointments", { method: "POST", body: payload }),
  });
}

// Reschedule returns the updated appointment (status -> Rescheduled) plus an
// inline `share` payload the ShareScreen can consume without a refetch.
export interface RescheduleResult extends RawAppointment {
  share: SharePayload;
}

export function useReschedule(id: number) {
  return useMutation({
    mutationFn: (payload: { date: string; time: string }) =>
      api<RescheduleResult>(`/appointments/${id}/reschedule`, {
        method: "POST",
        body: payload,
      }),
  });
}

export function useComplete() {
  return useMutation({
    mutationFn: (id: number) =>
      api<RawAppointment>(`/appointments/${id}/complete`, { method: "POST" }),
  });
}

// ----- Doctor: approve / reject an owner's reschedule request (SRS §3.6) -----
export function useRescheduleApprove(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<RawAppointment>(`/appointments/${id}/reschedule-approve`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointment", id] });
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}

export function useRescheduleReject(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<RawAppointment>(`/appointments/${id}/reschedule-reject`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointment", id] });
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}
