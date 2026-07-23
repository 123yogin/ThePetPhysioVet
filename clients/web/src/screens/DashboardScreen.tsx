import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTitle } from "../lib/useTitle";
import { useDashboard, useComplete } from "../api/appointments";
import { formatCurrency } from "../lib/money";
import Badge from "../components/Badge";
import NotificationFeed from "../components/NotificationFeed";
import type { CSSProperties, FormEvent } from "react";

// Label styling copied verbatim from the .completed-bar label below (load-bearing
// inline styles — no new vet.css classes are introduced).
const tileLabelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "var(--brown-500)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

// Value styling mirrors `.completed-bar .big` (which is scoped to the completed
// bar). Reused inline here so the stat value renders identically inside a
// .visit-card without adding a bespoke rule.
const tileValueStyle: CSSProperties = {
  fontSize: "1.75rem",
  fontWeight: 800,
  color: "var(--brown-900)",
  marginTop: 6,
};

// Mirrors dashboard.html. Cards for today's pending/rescheduled visits, then
// the .completed-bar footer. Inline styles are copied verbatim (load-bearing).
export default function DashboardScreen() {
  useTitle("Dashboard — ThePetPhysioVet");
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useDashboard();
  const complete = useComplete();

  const appts = data?.today_appointments ?? [];

  // US-DASH-02 — four stat tiles wired to REAL data from useDashboard(). Values
  // are null until `data` arrives; while loading we show a non-breaking "…" so
  // the tile layout never shifts. On error we render a graceful message instead
  // of any number (never stale/fake figures).
  const statTiles = [
    { label: "Active treatments", value: data ? String(data.active_treatments) : null },
    { label: "Pending payments", value: data ? formatCurrency(data.pending_payments) : null },
    { label: "Today’s revenue", value: data ? formatCurrency(data.today_revenue) : null },
    { label: "Monthly revenue", value: data ? formatCurrency(data.monthly_revenue) : null },
  ];

  function onComplete(e: FormEvent, id: number) {
    e.preventDefault();
    complete.mutate(id, {
      onSuccess: () => {
        // Completing a Pending visit drops it from today's list and bumps the
        // completed count; the appointments list also changes.
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["appointments"] });
      },
    });
  }

  return (
    <>
      <h1 className="page-title">Today&#8217;s visits</h1>
      <p className="page-sub">
        {data?.today_display} · Pending &amp; rescheduled slots for today only.
      </p>

      {/* US-DASH-02 — real-data stat tiles (SRS §3.2). Reuses .grid-cards +
          .visit-card + .big, with the completed-bar's label styling. */}
      <div className="grid-cards" style={{ marginBottom: 20 }}>
        {isError ? (
          <p className="panel">Could not load dashboard stats. Please try again.</p>
        ) : (
          statTiles.map((t) => (
            <article className="visit-card" style={{ margin: 0 }} key={t.label}>
              <div style={tileLabelStyle}>{t.label}</div>
              <div className="big" style={tileValueStyle} aria-busy={isLoading || undefined}>
                {isLoading || !data ? "…" : t.value}
              </div>
            </article>
          ))
        )}
      </div>

      <div className="grid-cards">
        {isLoading ? (
          <p className="panel">Loading today&#8217;s visits…</p>
        ) : isError ? (
          <p className="panel">Could not load today&#8217;s visits. Please try again.</p>
        ) : appts.length > 0 ? (
          appts.map((a) => (
            <article className="visit-card" style={{ margin: 0 }} key={a.id}>
              <h4>
                {a.pet_name} <Badge status={a.status} />
              </h4>
              <p className="meta-row">
                <strong>Owner</strong> {a.owner_name}
              </p>
              <p className="meta-row">
                <strong>Time</strong> {a.time}
              </p>
              <p className="meta-row">
                <strong>Pet type</strong> {a.pet_type}
              </p>
              <p className="meta-row">
                <strong>Visit</strong> {a.visit_type_display}
              </p>
              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <form className="inline-form" onSubmit={(e) => onComplete(e, a.id)}>
                  <input type="hidden" name="next" value="dashboard" />
                  <button
                    type="submit"
                    className="btn btn-sm btn-primary"
                    disabled={complete.isPending && complete.variables === a.id}
                  >
                    Mark completed
                  </button>
                </form>
                <Link className="btn btn-sm btn-ghost" to={`/appointments/${a.id}/share`}>
                  Share
                </Link>
              </div>
            </article>
          ))
        ) : (
          <p className="panel">
            No visits scheduled for today (or all are already completed).
          </p>
        )}
      </div>

      <div className="completed-bar panel" style={{ marginTop: 8 }}>
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--brown-500)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Completed visits
          </div>
          <div className="big">{data?.completed_count}</div>
        </div>
        <span style={{ fontSize: 13, color: "var(--brown-500)", maxWidth: 220 }}>
          Total completed appointments on your account.
        </span>
      </div>

      {/* Sprint 5 — doctor in-app notification feed (US-NOTIF-02). Self-contained
          glass-card; its mark-read/mark-all mutations invalidate ["notifications"]
          so the sidebar unread badge updates without a reload. */}
      <NotificationFeed />

      {/* Sprint 7 (B) — reachable entry point to the owner↔doctor query inbox
          without touching Sidebar.tsx (US-QUERY). */}
      <p style={{ marginTop: 16, fontSize: 14 }}>
        <Link to="/queries">Owner &amp; doctor queries &#8594;</Link>
      </p>
    </>
  );
}
