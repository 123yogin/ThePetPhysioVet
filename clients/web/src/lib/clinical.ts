// Client-side constants + helpers for the Sprint-3 clinical screens.
// Kept out of format.ts so the parity-critical formatting module is untouched.

import type {
  Duration,
  Frequency,
  PlanStatus,
  ReportType,
  Therapy,
} from "./types";

interface Choice<V extends string> {
  value: V;
  label: string;
}

// Labels mirror the SRS wording and the backend choice display names.
export const REPORT_TYPES: Choice<ReportType>[] = [
  { value: "XRAY", label: "X-Ray" },
  { value: "MRI", label: "MRI" },
  { value: "CT", label: "CT" },
  { value: "BLOOD", label: "Blood" },
  { value: "OTHER", label: "Other" },
];

export const THERAPIES: Choice<Therapy>[] = [
  { value: "LASER", label: "Laser" },
  { value: "HYDROTHERAPY", label: "Hydrotherapy" },
  { value: "STRETCHING", label: "Stretching" },
  { value: "HOME_EXERCISE", label: "Home Exercise" },
  { value: "OTHER", label: "Other" },
];

export const FREQUENCIES: Choice<Frequency>[] = [
  { value: "DAILY", label: "Daily" },
  { value: "ALTERNATE", label: "Alternate days" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "CUSTOM", label: "Custom" },
];

export const DURATIONS: Choice<Duration>[] = [
  { value: "4WK", label: "4 weeks" },
  { value: "8WK", label: "8 weeks" },
  { value: "CUSTOM", label: "Custom" },
];

export const PLAN_STATUSES: Choice<PlanStatus>[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "COMPLETED", label: "Completed" },
];

function labelFrom<V extends string>(list: Choice<V>[], value: V): string {
  return list.find((c) => c.value === value)?.label ?? value;
}

export const reportTypeLabel = (v: ReportType) => labelFrom(REPORT_TYPES, v);
export const therapyLabel = (v: Therapy) => labelFrom(THERAPIES, v);
export const frequencyLabel = (v: Frequency) => labelFrom(FREQUENCIES, v);
export const durationLabel = (v: Duration) => labelFrom(DURATIONS, v);
export const planStatusLabel = (v: PlanStatus) => labelFrom(PLAN_STATUSES, v);

// PlanStatus -> clinical.css badge modifier.
export function planStatusBadge(status: PlanStatus): string {
  switch (status) {
    case "ACTIVE":
      return "badge-active";
    case "ON_HOLD":
      return "badge-onhold";
    case "COMPLETED":
    default:
      return "badge-archived";
  }
}

// ----- File upload validation (mirrors the server allowlist + 20MB cap) -----

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB

const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "pdf", "dcm", "dicom"];

// Returns an error message, or null when the file is acceptable. The server
// re-validates by extension AND mime; this is the fast inline pre-check so the
// user sees ".alert-danger" before any bytes are uploaded.
export function validateUploadFile(file: File): string | null {
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return "Unsupported file type. Upload a JPG, PNG, PDF, or DICOM (.dcm / .dicom) file.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return "File exceeds the 20MB limit.";
  }
  return null;
}

// ----- Human-readable formatting for the new (no-golden) screens -----

export function humanSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

const MONTHS_AP = [
  "Jan.", "Feb.", "March", "April", "May", "June",
  "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec.",
];

// ISO datetime -> "July 22, 2026, 2:30 p.m." (matches the vet.css date/time feel
// used elsewhere, but computed locally for these no-pixel-target screens).
export function dateTimeMedium(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const h = d.getHours();
  const min = d.getMinutes();
  const ampm = h < 12 ? "a.m." : "p.m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const minutes = min === 0 ? "" : `:${String(min).padStart(2, "0")}`;
  return `${MONTHS_AP[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, ${h12}${minutes} ${ampm}`;
}
