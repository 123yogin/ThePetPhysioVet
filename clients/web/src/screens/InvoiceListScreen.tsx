import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTitle } from "../lib/useTitle";
import { dateMedium } from "../lib/format";
import { useInvoices } from "../api/billing";
import {
  formatCurrency,
  paymentModeLabel,
  paymentStatusBadge,
  paymentStatusLabel,
} from "../lib/money";

// US-PAY-01 (SRS §3.8). Lists the doctor's invoices in a native .panel/.table-wrap
// table, reusing vet.css classes only (no golden Django screen exists for billing).
// Route: /billing — with ?pet=<id> the useInvoices() hook scopes to one patient.
// Header carries the onward entry points (New invoice, Revenue); each row opens
// the invoice detail (/billing/invoices/:id).
export default function InvoiceListScreen() {
  useTitle("Billing — ThePetPhysioVet");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const petParam = params.get("pet");
  const petId = petParam ? Number(petParam) : undefined;

  const { data, isLoading, isError } = useInvoices(petId);
  const invoices = data ?? [];

  return (
    <>
      <h1 className="page-title">Billing &amp; invoices</h1>
      <p className="page-sub">Itemised invoices, payments and packages.</p>

      <div className="panel">
        <div className="section-head">
          <h2>Invoices</h2>
          <span>
            <Link className="btn btn-sm btn-ghost" to="/billing/revenue">
              Revenue
            </Link>{" "}
            <Link className="btn btn-sm btn-primary" to="/billing/invoices/new">
              &#10133; New invoice
            </Link>
          </span>
        </div>

        {isError && (
          <div className="alert alert-danger" role="alert">
            Could not load invoices. Please try again.
          </div>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Patient</th>
                <th>Total</th>
                <th>Status</th>
                <th>Mode</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6}>Loading invoices…</td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={6}>—</td>
                </tr>
              ) : invoices.length > 0 ? (
                invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    role="link"
                    tabIndex={0}
                    style={{ cursor: "pointer" }}
                    aria-label={`Open invoice ${inv.invoice_no}`}
                    onClick={() => navigate(`/billing/invoices/${inv.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/billing/invoices/${inv.id}`);
                      }
                    }}
                  >
                    <td style={{ whiteSpace: "nowrap" }}>
                      <Link
                        to={`/billing/invoices/${inv.id}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {inv.invoice_no}
                      </Link>
                    </td>
                    <td>{inv.pet_name}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{formatCurrency(inv.total)}</td>
                    <td>
                      <span className={`badge ${paymentStatusBadge(inv.payment_status)}`}>
                        {paymentStatusLabel(inv.payment_status)}
                      </span>
                    </td>
                    <td>{paymentModeLabel(inv.payment_mode)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {inv.created_at ? dateMedium(inv.created_at.slice(0, 10)) : "—"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>
                    No invoices yet.{" "}
                    <Link to="/billing/invoices/new">Create your first invoice</Link>.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
