import { useState } from "react";
import { useTitle } from "../lib/useTitle";
import { useOwnerInvoices, useOwnerInvoice, useOwnerPayInvoice, ownerReceiptUrl } from "../api/owner";
import { formatCurrency, paymentStatusBadge, paymentStatusLabel } from "../lib/money";
import type { Invoice } from "../lib/types";

const muted = { color: "var(--brown-500)" };

// One invoice row: header always visible; expanding lazily loads the detail
// (line items + balance) and reveals Pay + Download-receipt actions.
function InvoiceRow({ inv }: { inv: Invoice }) {
  const [open, setOpen] = useState(false);
  const detail = useOwnerInvoice(open ? inv.id : NaN);
  const pay = useOwnerPayInvoice(inv.id);
  const [receiptErr, setReceiptErr] = useState<string | null>(null);
  const balance = detail.data?.balance_due ?? inv.total;
  const receiptable = inv.payment_status === "PAID" || inv.payment_status === "PARTIALLY_PAID";

  async function downloadReceipt() {
    setReceiptErr(null);
    try {
      // "application/pdf, */*" — a bare application/pdf fails DRF content
      // negotiation (JSON-only renderers) with 406; the */* fallback lets it
      // through while the server still streams real PDF bytes.
      const res = await fetch(ownerReceiptUrl(inv.id), { credentials: "include", headers: { Accept: "application/pdf, */*" } });
      if (!res.ok) { setReceiptErr("A receipt is available once the invoice is paid."); return; }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url; a.download = `receipt-invoice-${inv.invoice_no}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch { setReceiptErr("Could not generate the receipt. Please try again."); }
  }

  return (
    <div style={{ borderTop: "1px solid rgba(62,39,35,.08)", paddingTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: 0, textAlign: "left" }}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "▾" : "▸"} <strong>Invoice #{inv.invoice_no}</strong>{" "}
          <span style={muted}>· {inv.pet_name} · {formatCurrency(inv.total)}</span>
        </button>
        <span className={paymentStatusBadge(inv.payment_status)}>{paymentStatusLabel(inv.payment_status)}</span>
      </div>

      {open ? (
        <div style={{ marginTop: 10 }}>
          {detail.isLoading ? (
            <p style={{ ...muted, marginTop: 0 }}>Loading…</p>
          ) : detail.data ? (
            <>
              <ul style={{ marginTop: 0 }}>
                {detail.data.line_items.map((li, i) => (
                  <li key={i}>{li.description} × {li.quantity} — {formatCurrency(li.amount)}</li>
                ))}
              </ul>
              <p style={{ margin: "4px 0" }}>
                Paid {formatCurrency(detail.data.amount_paid)} · <strong>Balance {formatCurrency(balance)}</strong>
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {Number(balance) > 0 ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={pay.isPending}
                    onClick={() => pay.mutate(balance)}
                  >
                    {pay.isPending ? "Processing…" : `Pay ${formatCurrency(balance)}`}
                  </button>
                ) : null}
                {receiptable ? (
                  <button type="button" className="btn btn-ghost" onClick={downloadReceipt}>Download receipt</button>
                ) : null}
              </div>
              {pay.isError ? <div className="alert alert-danger" role="alert" style={{ marginTop: 8 }}>Payment failed. Please try again.</div> : null}
              {receiptErr ? <div className="alert alert-danger" role="alert" style={{ marginTop: 8 }}>{receiptErr}</div> : null}
            </>
          ) : (
            <p style={{ ...muted, marginTop: 0 }}>Could not load this invoice.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

// Owner billing (SRS §3.8 owner side): view invoices, pay, download receipts.
export default function OwnerBillingScreen() {
  useTitle("Billing — ThePetPhysioVet");
  const { data, isLoading, isError } = useOwnerInvoices();

  return (
    <>
      <h1 className="page-title">Billing</h1>
      <p className="page-sub">Your invoices, payments and receipts.</p>
      <div className="panel">
        {isLoading ? (
          <p style={{ marginTop: 0 }}>Loading…</p>
        ) : isError ? (
          <p style={{ marginTop: 0 }}>Could not load your invoices.</p>
        ) : data && data.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {data.map((inv) => <InvoiceRow key={inv.id} inv={inv} />)}
          </div>
        ) : (
          <p style={{ ...muted, marginTop: 0 }}>No invoices yet.</p>
        )}
      </div>
    </>
  );
}
