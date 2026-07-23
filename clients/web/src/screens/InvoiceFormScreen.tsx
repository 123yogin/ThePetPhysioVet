import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTitle } from "../lib/useTitle";
import Field from "../components/Field";
import { usePets } from "../api/pets";
import { useCreateInvoice, type CreateInvoicePayload } from "../api/billing";
import { formatCurrency, paymentModeLabel } from "../lib/money";
import { ApiError } from "../lib/http";
import type { PaymentMode } from "../lib/types";

// US-PAY-01 / US-PAY-02 — build an itemised invoice (SRS §3.8).
// Route: /billing/invoices/new (optionally ?pet=<id> to preselect a patient).
// Dynamic line-item rows (description / quantity / unit_price) with a live
// per-line amount and a live subtotal / tax / total preview — the server is
// authoritative on save (invoice_no, subtotal and total are computed there).
// payment_mode has exactly the four SRS modes; 'package' reveals a
// total_sessions input. Inline non-negative/numeric validation, and server 400
// field + non_field_errors are surfaced in the same Field slots the Sprint-3
// screens use.

// Exactly the four SRS payment modes, in a stable display order.
const PAYMENT_MODES: PaymentMode[] = ["advance", "post_treatment", "package", "partial"];

interface ItemRow {
  description: string;
  quantity: string; // kept as strings so the inputs stay controlled + validatable
  unit_price: string;
}

const emptyRow = (): ItemRow => ({ description: "", quantity: "1", unit_price: "" });

// Parse a user-entered numeric string. Returns NaN for anything non-numeric so
// callers can distinguish "empty/garbage" from a real 0.
function toNum(s: string): number {
  const t = s.trim();
  if (t === "") return NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

// Live per-line amount for the preview (0 when a value is missing/invalid).
function lineAmount(row: ItemRow): number {
  const q = toNum(row.quantity);
  const p = toNum(row.unit_price);
  if (!Number.isFinite(q) || !Number.isFinite(p)) return 0;
  return q * p;
}

export default function InvoiceFormScreen() {
  useTitle("New invoice — ThePetPhysioVet");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const petParam = searchParams.get("pet") ?? "";

  const { data: pets, isLoading: petsLoading, isError: petsError } = usePets();
  const create = useCreateInvoice();

  const [petId, setPetId] = useState<string>(petParam);
  const [items, setItems] = useState<ItemRow[]>([emptyRow()]);
  const [tax, setTax] = useState<string>("0");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("advance");
  const [totalSessions, setTotalSessions] = useState<string>("");
  // Client-side per-field validation errors (keyed like the server payload;
  // line-item rows use "items-<index>-<field>").
  const [clientErrors, setClientErrors] = useState<Record<string, string[]>>({});

  // Server 400 body: { field: [msg], non_field_errors: [msg], line_items: ... }.
  const serverErr =
    create.error instanceof ApiError && create.error.status === 400
      ? (create.error.data as Record<string, unknown>)
      : null;
  // A request that failed for a non-validation reason (network / 500 / auth).
  const generalError =
    create.error && !(create.error instanceof ApiError && create.error.status === 400);

  // Flatten any DRF error value (string | string[] | nested) into string[].
  function flatten(value: unknown): string[] {
    if (value == null) return [];
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(flatten);
    if (typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(flatten);
    return [String(value)];
  }

  // Merge client + server errors for a given field name into one list.
  function errorsFor(name: string, serverKeys: string[] = [name]): string[] | undefined {
    const out: string[] = [...(clientErrors[name] ?? [])];
    if (serverErr) for (const k of serverKeys) out.push(...flatten(serverErr[k]));
    return out.length > 0 ? out : undefined;
  }

  const nonFieldErrors: string[] = serverErr ? flatten(serverErr.non_field_errors) : [];
  // Server line-item errors that couldn't be pinned to a specific input.
  const lineItemsError = serverErr ? flatten(serverErr.line_items) : [];

  const subtotal = useMemo(() => items.reduce((sum, r) => sum + lineAmount(r), 0), [items]);
  const taxPreview = Number.isFinite(toNum(tax)) ? Math.max(toNum(tax), 0) : 0;
  const total = subtotal + taxPreview;

  function updateItem(index: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function addItem() {
    setItems((prev) => [...prev, emptyRow()]);
  }
  function removeItem(index: number) {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  // Inline non-negative / numeric validation. Populates clientErrors and
  // returns true when the form is safe to submit.
  function validate(): boolean {
    const errs: Record<string, string[]> = {};

    if (!petId) errs.pet_id = ["Select a patient for this invoice."];

    let hasLine = false;
    items.forEach((row, i) => {
      const described = row.description.trim() !== "";
      const q = toNum(row.quantity);
      const p = toNum(row.unit_price);
      // A row is only validated once the user has started filling it in.
      const touched = described || row.quantity.trim() !== "" || row.unit_price.trim() !== "";
      if (!touched) return;
      hasLine = true;
      if (!described) errs[`items-${i}-description`] = ["Enter a description."];
      if (!Number.isFinite(q)) errs[`items-${i}-quantity`] = ["Enter a valid quantity."];
      else if (q < 0) errs[`items-${i}-quantity`] = ["Quantity cannot be negative."];
      else if (q === 0) errs[`items-${i}-quantity`] = ["Quantity must be greater than zero."];
      if (!Number.isFinite(p)) errs[`items-${i}-unit_price`] = ["Enter a valid unit price."];
      else if (p < 0) errs[`items-${i}-unit_price`] = ["Unit price cannot be negative."];
    });
    if (!hasLine) errs.line_items = ["Add at least one line item."];

    if (tax.trim() !== "") {
      const t = toNum(tax);
      if (!Number.isFinite(t)) errs.tax = ["Enter a valid tax amount."];
      else if (t < 0) errs.tax = ["Tax cannot be negative."];
    }

    if (paymentMode === "package") {
      const s = toNum(totalSessions);
      if (!Number.isFinite(s)) errs.total_sessions = ["Enter the number of sessions in the package."];
      else if (!Number.isInteger(s) || s < 1) errs.total_sessions = ["Sessions must be a whole number of at least 1."];
    }

    setClientErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validate()) return;

    // Only rows the user actually filled in become line items.
    const lineItems = items
      .filter((r) => r.description.trim() !== "" || r.quantity.trim() !== "" || r.unit_price.trim() !== "")
      .map((r) => {
        const quantity = toNum(r.quantity);
        const unit_price = toNum(r.unit_price);
        return {
          description: r.description.trim(),
          quantity,
          unit_price,
          // amount is a preview only; the server recomputes it authoritatively.
          amount: quantity * unit_price,
        };
      });

    const payload: CreateInvoicePayload = {
      pet_id: Number(petId),
      line_items: lineItems,
      tax: tax.trim() === "" ? 0 : toNum(tax),
      payment_mode: paymentMode,
    };
    if (paymentMode === "package") payload.total_sessions = toNum(totalSessions);

    create.mutate(payload, {
      onSuccess: (invoice) => navigate(`/billing/invoices/${invoice.id}`),
    });
  }

  return (
    <>
      <h1 className="page-title">New invoice</h1>
      <p className="page-sub">
        Add itemised charges, choose how it's paid, and we'll total it up. Totals are
        confirmed on save.
      </p>

      <div className="panel">
        {nonFieldErrors.length > 0 ? (
          <div className="alert alert-danger">{nonFieldErrors.join(" ")}</div>
        ) : null}
        {generalError ? (
          <div className="alert alert-danger">
            Could not save the invoice. Please check your connection and try again.
          </div>
        ) : null}

        <form className="form-grid" onSubmit={onSubmit} noValidate>
          <Field label="Patient" htmlFor="id_pet" extra="full" errors={errorsFor("pet_id", ["pet_id", "pet"])}>
            <select
              id="id_pet"
              className="input-glass"
              value={petId}
              onChange={(e) => setPetId(e.target.value)}
              required
            >
              <option value="">
                {petsLoading ? "Loading patients…" : petsError ? "Could not load patients" : "---------"}
              </option>
              {(pets ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {`${p.name} (${p.owner_name})`}
                </option>
              ))}
            </select>
          </Field>

          {/* Line items — dynamic rows */}
          <div className="field full">
            <label>Line items:</label>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "50%" }}>Description</th>
                    <th style={{ width: "12%" }}>Qty</th>
                    <th style={{ width: "18%" }}>Unit price</th>
                    <th style={{ width: "15%" }}>Amount</th>
                    <th style={{ width: "5%" }} aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, i) => {
                    const descErr = errorsFor(`items-${i}-description`);
                    const qtyErr = errorsFor(`items-${i}-quantity`);
                    const priceErr = errorsFor(`items-${i}-unit_price`);
                    return (
                      <tr key={i}>
                        <td>
                          <input
                            className="input-glass"
                            type="text"
                            aria-label={`Line ${i + 1} description`}
                            placeholder="e.g. Hydrotherapy session"
                            value={row.description}
                            onChange={(e) => updateItem(i, { description: e.target.value })}
                          />
                          {descErr ? (
                            <ul className="errorlist">{descErr.map((m, k) => <li key={k}>{m}</li>)}</ul>
                          ) : null}
                        </td>
                        <td>
                          <input
                            className="input-glass"
                            type="number"
                            min={0}
                            step="1"
                            inputMode="numeric"
                            aria-label={`Line ${i + 1} quantity`}
                            value={row.quantity}
                            onChange={(e) => updateItem(i, { quantity: e.target.value })}
                          />
                          {qtyErr ? (
                            <ul className="errorlist">{qtyErr.map((m, k) => <li key={k}>{m}</li>)}</ul>
                          ) : null}
                        </td>
                        <td>
                          <input
                            className="input-glass"
                            type="number"
                            min={0}
                            step="0.01"
                            inputMode="decimal"
                            aria-label={`Line ${i + 1} unit price`}
                            placeholder="0.00"
                            value={row.unit_price}
                            onChange={(e) => updateItem(i, { unit_price: e.target.value })}
                          />
                          {priceErr ? (
                            <ul className="errorlist">{priceErr.map((m, k) => <li key={k}>{m}</li>)}</ul>
                          ) : null}
                        </td>
                        <td>{formatCurrency(lineAmount(row))}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => removeItem(i)}
                            disabled={items.length <= 1}
                            aria-label={`Remove line ${i + 1}`}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {lineItemsError.length > 0 ? (
              <ul className="errorlist">{lineItemsError.map((m, k) => <li key={k}>{m}</li>)}</ul>
            ) : null}
            {clientErrors.line_items ? (
              <ul className="errorlist">{clientErrors.line_items.map((m, k) => <li key={k}>{m}</li>)}</ul>
            ) : null}
            <div style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={addItem}>
                + Add line item
              </button>
            </div>
          </div>

          {/* Payment mode + conditional package sessions */}
          <Field label="Payment mode" htmlFor="id_payment_mode" errors={errorsFor("payment_mode")}>
            <select
              id="id_payment_mode"
              className="input-glass"
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
            >
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {paymentModeLabel(m)}
                </option>
              ))}
            </select>
          </Field>
          {paymentMode === "package" ? (
            <Field
              label="Sessions in package"
              htmlFor="id_total_sessions"
              help="Number of prepaid sessions; the counter decrements as appointments complete."
              errors={errorsFor("total_sessions")}
            >
              <input
                id="id_total_sessions"
                className="input-glass"
                type="number"
                min={1}
                step="1"
                inputMode="numeric"
                placeholder="e.g. 10"
                value={totalSessions}
                onChange={(e) => setTotalSessions(e.target.value)}
              />
            </Field>
          ) : (
            <div className="field" aria-hidden="true" />
          )}

          {/* Tax */}
          <Field label="Tax" htmlFor="id_tax" errors={errorsFor("tax")}>
            <input
              id="id_tax"
              className="input-glass"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              value={tax}
              onChange={(e) => setTax(e.target.value)}
            />
          </Field>
          <div className="field" aria-hidden="true" />

          {/* Live totals preview */}
          <div className="field full">
            <div className="table-wrap">
              <table>
                <tbody>
                  <tr>
                    <th style={{ width: "70%" }}>Subtotal</th>
                    <td>{formatCurrency(subtotal)}</td>
                  </tr>
                  <tr>
                    <th>Tax</th>
                    <td>{formatCurrency(taxPreview)}</td>
                  </tr>
                  <tr>
                    <th>Total</th>
                    <td><strong>{formatCurrency(total)}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="field-hint" style={{ marginTop: 8 }}>
              Preview only — the invoice number and final totals are set when you save.
            </p>
          </div>

          <div className="form-actions full">
            <Link className="btn btn-ghost" to={petParam ? `/billing?pet=${petParam}` : "/billing"}>
              Cancel
            </Link>
            <button type="submit" className="btn btn-primary" disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Create invoice"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
