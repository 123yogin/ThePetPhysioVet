// Shared billing display helpers (SRS §3.8). Kept out of format.ts (the
// parity-critical module) and clinical.ts. Reuses ONLY existing vet.css /
// clinical.css badge classes — no new stylesheet is introduced.

import type { PaymentMode, PaymentStatus } from "./types";

/**
 * Format a rupee amount for display, e.g. 12500 -> "₹12,500.00".
 * Accepts a number or a string (DRF DecimalField serialises to a string by
 * default). Non-numeric / missing input renders as "₹0.00" so a row never shows
 * "NaN". Uses the Indian locale grouping (en-IN) and INR currency.
 */
export function formatCurrency(amount: number | string | null | undefined): string {
  const n = typeof amount === "string" ? Number(amount) : (amount ?? 0);
  const value = Number.isFinite(n) ? (n as number) : 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// PaymentStatus -> an EXISTING pill-badge modifier. No red badge exists in
// vet.css/clinical.css, so FAILED reuses the muted brown .badge-archived (reads
// as "dead/settled-negative") — every status stays visually distinct:
//   PENDING         amber   (.badge-pending)
//   PAID            green   (.badge-completed)
//   PARTIALLY_PAID  blue    (.badge-rescheduled)
//   FAILED          brown   (.badge-archived)
export function paymentStatusBadge(status: PaymentStatus): string {
  switch (status) {
    case "PAID":
      return "badge-completed";
    case "PARTIALLY_PAID":
      return "badge-rescheduled";
    case "FAILED":
      return "badge-archived";
    case "PENDING":
    default:
      return "badge-pending";
  }
}

// Human label for a PaymentStatus (badge text / filters).
const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Pending",
  PAID: "Paid",
  PARTIALLY_PAID: "Partially paid",
  FAILED: "Failed",
};

export function paymentStatusLabel(status: PaymentStatus): string {
  return PAYMENT_STATUS_LABELS[status] ?? status;
}

// Human label for a PaymentMode (form options / invoice header).
const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  advance: "Advance",
  post_treatment: "Post-treatment",
  package: "Package",
  partial: "Partial",
};

export function paymentModeLabel(mode: PaymentMode): string {
  return PAYMENT_MODE_LABELS[mode] ?? mode;
}
