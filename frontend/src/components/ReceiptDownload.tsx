import { useState, type CSSProperties } from "react";
import { receiptUrl } from "../api/billing";
import type { PaymentStatus } from "../lib/types";

// US-PAY-05 — downloadable PDF receipt.
// Self-contained: fetches the server-generated PDF at billing.receiptUrl(id)
// and triggers a browser download. The receipt is only meaningful once money
// has been taken, so it renders ONLY for PAID / PARTIALLY_PAID — the parent
// (InvoiceDetailScreen) already gates on this, but we defend here too.
//
// We fetch the PDF as a blob (rather than a plain <a href>) so a failed
// server generation surfaces as an inline .alert-danger instead of a blank
// or broken download tab. Session cookie + same-origin, so credentials only.
// No new stylesheet: .btn / .alert-danger come from the reused vet.css.

// Statuses for which a receipt exists (payment has been captured).
const RECEIPTABLE: ReadonlySet<PaymentStatus> = new Set<PaymentStatus>([
  "PAID",
  "PARTIALLY_PAID",
]);

// Inline visually-hidden style — vet.css has no .sr-only class and we must not
// add a stylesheet. Keeps the label announced while the icon-free button reads
// naturally; the aria-label already names the control, this reinforces it.
const srOnly: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

export interface ReceiptDownloadProps {
  invoiceId: number;
  status: PaymentStatus;
}

export default function ReceiptDownload({ invoiceId, status }: ReceiptDownloadProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Defensive gate: no receipt for un-paid invoices even if a parent slips up.
  if (!RECEIPTABLE.has(status)) return null;

  async function handleDownload() {
    if (loading) return;
    setLoading(true);
    setError(null);
    let objectUrl: string | null = null;
    try {
      const res = await fetch(receiptUrl(invoiceId), {
        method: "GET",
        credentials: "include",
        // Include a */* fallback: the API's DRF renderers are JSON-only, so a
        // bare "application/pdf" Accept fails content negotiation with 406
        // before the view runs. The server still returns real application/pdf
        // bytes; */* just lets negotiation succeed (and 409s render as JSON).
        headers: { Accept: "application/pdf, */*" },
      });
      if (!res.ok) {
        // 409 = invoice isn't paid yet (nothing to receipt), not a real failure.
        setError(
          res.status === 409
            ? "A receipt is available once the invoice is paid."
            : "Could not generate the receipt. Please try again.",
        );
        return;
      }
      const blob = await res.blob();
      objectUrl = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `receipt-invoice-${invoiceId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      // Any failure (network or non-2xx) -> inline alert, never a broken tab.
      setError("Could not generate the receipt. Please try again.");
    } finally {
      if (objectUrl) {
        // Give the browser a tick to start the download before revoking.
        setTimeout(() => URL.revokeObjectURL(objectUrl!), 10_000);
      }
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={handleDownload}
        disabled={loading}
        aria-busy={loading}
        aria-label="Download PDF receipt"
      >
        {loading ? "Preparing…" : "Download receipt"}
        <span style={srOnly}>Download PDF receipt</span>
      </button>
      {error ? (
        <div className="alert alert-danger" role="alert" style={{ marginTop: 8 }}>
          {error}
        </div>
      ) : null}
    </>
  );
}
