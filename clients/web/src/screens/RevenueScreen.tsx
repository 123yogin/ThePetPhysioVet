import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { useTitle } from "../lib/useTitle";
import { useRevenue } from "../api/billing";
import { formatCurrency } from "../lib/money";
import type { RevenueRange } from "../lib/types";

// US-PAY-06 — Revenue dashboard (SRS §3.8). Route /billing/revenue.
// A keyboard-navigable Day/Week/Month range selector drives useRevenue(range);
// switching swaps the React Query key so the total/count update in place (no
// full reload). Reuses the dashboard's .panel/.completed-bar/.big styling and
// vet.css :root tokens only — no hardcoded colors, no new stylesheet, and the
// golden DashboardScreen is left untouched.

const RANGES: { value: RevenueRange; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

// vet.css styles `.big` only inside `.completed-bar`; the primary total lives
// there and inherits it. Secondary stat tiles reuse the same look via tokens
// (no hardcoded colors) so the number reads identically outside that context.
const bigStat = {
  fontSize: "1.75rem",
  fontWeight: 800,
  color: "var(--brown-900)",
} as const;

// Prefix used with the dashboard's uppercase mini-label styling.
function statLabel(text: string) {
  return (
    <div
      style={{
        fontSize: 13,
        fontWeight: 700,
        color: "var(--brown-500)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      {text}
    </div>
  );
}

export default function RevenueScreen() {
  useTitle("Revenue — ThePetPhysioVet");
  const [range, setRange] = useState<RevenueRange>("day");
  const { data, isLoading, isError, refetch } = useRevenue(range);

  // Roving keyboard navigation across the range buttons (arrows/Home/End) on top
  // of the native Tab + Enter/Space activation, so the selector is fully
  // keyboard-operable per WCAG 2.1 AA.
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (index + 1) % RANGES.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (index - 1 + RANGES.length) % RANGES.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = RANGES.length - 1;
    else return;
    e.preventDefault();
    setRange(RANGES[next].value);
    btnRefs.current[next]?.focus();
  }

  const activeLabel = RANGES.find((r) => r.value === range)?.label ?? "";

  return (
    <>
      <h1 className="page-title">Revenue</h1>
      <p className="page-sub">
        Collected revenue by window · <Link to="/billing">back to billing</Link>.
      </p>

      <div
        role="group"
        aria-label="Revenue time range"
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}
      >
        {RANGES.map((r, i) => {
          const selected = r.value === range;
          return (
            <button
              key={r.value}
              type="button"
              ref={(el) => {
                btnRefs.current[i] = el;
              }}
              className={`btn btn-sm ${selected ? "btn-primary" : "btn-ghost"}`}
              aria-pressed={selected}
              // Roving tabindex: only the active control is a Tab stop; arrows move within.
              tabIndex={selected ? 0 : -1}
              onClick={() => setRange(r.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {/* aria-live so the total is announced when the range changes in place. */}
      <div className="completed-bar panel" aria-live="polite" aria-busy={isLoading}>
        {isError ? (
          <>
            <div>
              {statLabel(`${activeLabel} revenue`)}
              <div className="big">—</div>
            </div>
            <span
              style={{
                fontSize: 13,
                color: "var(--brown-500)",
                maxWidth: 260,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              Could not load revenue.
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => refetch()}>
                Retry
              </button>
            </span>
          </>
        ) : isLoading ? (
          <>
            <div>
              {statLabel(`${activeLabel} revenue`)}
              <div className="big">…</div>
            </div>
            <span style={{ fontSize: 13, color: "var(--brown-500)", maxWidth: 260 }}>
              Loading revenue for the selected window…
            </span>
          </>
        ) : (
          <>
            <div>
              {statLabel(`${activeLabel} revenue`)}
              {/* Zero revenue still renders a clear ₹0.00 total — never blank. */}
              <div className="big">{formatCurrency(data?.total ?? 0)}</div>
            </div>
            <span style={{ fontSize: 13, color: "var(--brown-500)", maxWidth: 260 }}>
              {(data?.paid_count ?? 0) === 0
                ? "No settled payments in this window yet."
                : `From ${data?.paid_count} settled payment${data?.paid_count === 1 ? "" : "s"} this ${range}.`}
            </span>
          </>
        )}
      </div>

      {!isError && !isLoading && (
        <div className="grid-cards">
          <article className="visit-card" style={{ margin: 0 }}>
            {statLabel("Invoices")}
            <div className="big" style={bigStat}>{data?.invoice_count ?? 0}</div>
            <p className="meta-row" style={{ marginTop: 6 }}>
              Total invoices raised in this {range}.
            </p>
          </article>

          <article className="visit-card" style={{ margin: 0 }}>
            {statLabel("Paid")}
            <div className="big" style={bigStat}>{data?.paid_count ?? 0}</div>
            <p className="meta-row" style={{ marginTop: 6 }}>
              Invoices fully settled in this {range}.
            </p>
          </article>

          <article className="visit-card" style={{ margin: 0 }}>
            {statLabel("Outstanding")}
            <div className="big" style={bigStat}>{formatCurrency(data?.pending_total ?? 0)}</div>
            <p className="meta-row" style={{ marginTop: 6 }}>
              Unpaid / partial balance in this {range}.
            </p>
          </article>
        </div>
      )}
    </>
  );
}
