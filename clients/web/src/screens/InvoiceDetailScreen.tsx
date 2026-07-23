import { Link, useParams } from "react-router-dom";
import { useTitle } from "../lib/useTitle";
import { useInvoice } from "../api/billing";
import { ApiError } from "../lib/http";
import {
  formatCurrency,
  paymentModeLabel,
  paymentStatusBadge,
  paymentStatusLabel,
} from "../lib/money";
import { dateTimeMedium } from "../lib/clinical";
import CheckoutButton from "../components/CheckoutButton";
import ReceiptDownload from "../components/ReceiptDownload";

// Invoice detail hub (/billing/invoices/:id) — US-PAY-02/03/05.
// Reuses vet.css .glass-card/.panel/.badge/.table-wrap so it renders native.
// Loading / error / not-found states mirror PetDetailScreen.
export default function InvoiceDetailScreen() {
  const { id } = useParams();
  const invoiceId = Number(id);

  const { data: inv, isLoading, error } = useInvoice(invoiceId);
  const notFound = error instanceof ApiError && error.status === 404;

  useTitle(`${inv?.invoice_no ?? "Invoice"} — ThePetPhysioVet`);

  if (notFound) {
    return (
      <>
        <h1 className="page-title">Invoice</h1>
        <div className="panel">
          <p style={{ margin: 0 }}>
            Invoice not found. <Link to="/billing">Back to billing</Link>.
          </p>
        </div>
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <h1 className="page-title">Invoice</h1>
        <div className="panel">
          <p style={{ margin: 0 }}>Loading invoice…</p>
        </div>
      </>
    );
  }

  if (error || !inv) {
    return (
      <>
        <h1 className="page-title">Invoice</h1>
        <div className="panel">
          <p style={{ margin: 0 }}>
            Could not load this invoice. Please try again, or{" "}
            <Link to="/billing">back to billing</Link>.
          </p>
        </div>
      </>
    );
  }

  const isPayable = inv.payment_status === "PENDING" || inv.payment_status === "PARTIALLY_PAID";
  const isReceiptable = inv.payment_status === "PAID" || inv.payment_status === "PARTIALLY_PAID";
  const showSettlement = inv.payment_status === "PARTIALLY_PAID";
  const lineItems = inv.line_items ?? [];
  const payments = inv.payments ?? [];

  return (
    <>
      <h1 className="page-title">{inv.invoice_no}</h1>
      <p className="page-sub">
        Invoice for <strong>{inv.pet_name}</strong> — itemised billing and payment history.
      </p>

      {/* ----- Summary header ----- */}
      <div className="glass-card">
        <div className="section-head">
          <h2>Summary</h2>
          <span className={`badge ${paymentStatusBadge(inv.payment_status)}`}>
            {paymentStatusLabel(inv.payment_status)}
          </span>
        </div>
        <p className="meta-row">
          <strong>Invoice no.:</strong> {inv.invoice_no}
        </p>
        <p className="meta-row">
          <strong>Patient:</strong>{" "}
          <Link to={`/patients/${inv.pet_id}`}>{inv.pet_name}</Link>
        </p>
        <p className="meta-row">
          <strong>Payment mode:</strong> {paymentModeLabel(inv.payment_mode)}
        </p>
        <p className="meta-row">
          <strong>Raised:</strong> {dateTimeMedium(inv.created_at)}
        </p>

        {/* Checkout (PENDING / PARTIALLY_PAID) and receipt (PAID / PARTIALLY_PAID) */}
        <div className="form-actions" style={{ marginTop: 12 }}>
          {isPayable ? <CheckoutButton invoice={inv} /> : null}
          {isReceiptable ? (
            <ReceiptDownload invoiceId={inv.id} status={inv.payment_status} />
          ) : null}
        </div>
      </div>

      {/* ----- Line items + totals ----- */}
      <div className="panel">
        <div className="section-head">
          <h2>Line items</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th style={{ textAlign: "right" }}>Qty</th>
                <th style={{ textAlign: "right" }}>Unit price</th>
                <th style={{ textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.length > 0 ? (
                lineItems.map((li, i) => (
                  <tr key={i}>
                    <td>{li.description}</td>
                    <td style={{ textAlign: "right" }}>{li.quantity}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {formatCurrency(li.unit_price)}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {formatCurrency(li.amount)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>No line items on this invoice.</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ textAlign: "right" }}>
                  <strong>Subtotal</strong>
                </td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {formatCurrency(inv.subtotal)}
                </td>
              </tr>
              <tr>
                <td colSpan={3} style={{ textAlign: "right" }}>
                  <strong>Tax</strong>
                </td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {formatCurrency(inv.tax)}
                </td>
              </tr>
              <tr>
                <td colSpan={3} style={{ textAlign: "right" }}>
                  <strong>Total</strong>
                </td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <strong>{formatCurrency(inv.total)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Partial settlement: amount paid vs balance due */}
        {showSettlement ? (
          <p className="meta-row" style={{ marginTop: 12 }}>
            <strong>Amount paid:</strong> {formatCurrency(inv.amount_paid)}
            {" · "}
            <strong>Balance due:</strong> {formatCurrency(inv.balance_due)}
          </p>
        ) : null}
      </div>

      {/* ----- Package sessions (package-mode invoices) ----- */}
      {inv.package ? (
        <div className="panel">
          <div className="section-head">
            <h2>Package sessions</h2>
          </div>
          <p className="meta-row">
            <strong>Total sessions:</strong> {inv.package.total_sessions}
          </p>
          <p className="meta-row">
            <strong>Used:</strong> {inv.package.used_sessions}
          </p>
          <p className="meta-row">
            <strong>Remaining:</strong> {inv.package.remaining_sessions}
          </p>
        </div>
      ) : null}

      {/* ----- Payments ----- */}
      <div className="panel">
        <div className="section-head">
          <h2>Payments</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th>Status</th>
                <th>Reference</th>
                <th>Paid</th>
              </tr>
            </thead>
            <tbody>
              {payments.length > 0 ? (
                payments.map((p) => (
                  <tr key={p.id}>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {formatCurrency(p.amount_paid)}
                    </td>
                    <td>
                      <span className={`badge ${paymentStatusBadge(p.status)}`}>
                        {paymentStatusLabel(p.status)}
                      </span>
                    </td>
                    <td>{p.gateway_ref ?? "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {p.paid_at ? dateTimeMedium(p.paid_at) : "—"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>No payments recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
