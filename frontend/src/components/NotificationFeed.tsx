import { Link } from "react-router-dom";
import { useNotifications, useMarkRead, useMarkAllRead } from "../api/notifications";
import { dateMedium, formatTime } from "../lib/format";
import type { Notification, NotificationType } from "../lib/types";

// US-NOTIF-02 — Doctor in-app feed for the dashboard (SRS §3.7 + §7).
//
// Lists the latest N notifications (message + timestamp, newest first) from
// useNotifications. Each row is a per-item mark-read control, and the header
// carries a mark-all-read control. Both mutations invalidate the ["notifications"]
// family (see api/notifications.ts) so the sidebar unread badge and this feed
// refetch in place — no page reload — and, because read state is server-side, it
// persists across a reload. Renders a graceful empty state when there are none
// (AC-04). Styling is vet.css + the clinical.css notification classes added by
// frontend_foundation — this component adds NO CSS.

// Bound the dashboard feed to the latest N (server may cap lower via its default).
const FEED_LIMIT = 10;

// Per-type glyph (HTML entities, matching the app's icon convention). Unknown /
// forward-compat types fall back to the bell.
const TYPE_ICON: Record<string, string> = {
  appointment_created: "\u{1F4C5}", // calendar
  appointment_accepted: "✅", // check mark
  appointment_rescheduled: "\u{1F504}", // arrows
  appointment_cancelled: "❌", // cross
  invoice_generated: "\u{1F9FE}", // receipt
  payment_received: "\u{1F4B3}", // card
  diagnosis_uploaded: "\u{1F4C4}", // page
  treatment_added: "\u{1F4CB}", // clipboard
  reminder: "⏰", // alarm clock
};

function iconFor(type: NotificationType): string {
  // The serializer emits the raw model type (uppercase, e.g. "APPOINTMENT_CREATED");
  // TYPE_ICON is keyed lowercase, so normalise before lookup. Unknown /
  // forward-compat types still fall back to the bell.
  return TYPE_ICON[String(type).toLowerCase()] ?? "\u{1F514}"; // bell
}

// Format created_at (ISO datetime) as "July 22, 2026 · 9:30 a.m." by reusing the
// existing Django-parity formatters on the wall-clock date/time parts. Parsing
// the leading "YYYY-MM-DDTHH:MM" directly (rather than new Date()) keeps the
// rendered day/time free of local-timezone drift, matching the seeded golden.
function formatWhen(iso: string): string {
  const [datePart, timePart] = iso.split("T");
  if (!datePart) return iso;
  const day = dateMedium(datePart);
  if (!timePart) return day;
  const hhmm = timePart.slice(0, 5); // "HH:MM"
  return `${day} · ${formatTime(hhmm)}`;
}

// Newest-first ordering, applied defensively even if the API already sorts.
function newestFirst(items: Notification[]): Notification[] {
  return [...items].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export default function NotificationFeed() {
  const { data, isLoading, isError } = useNotifications(FEED_LIMIT);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  const items = data ? newestFirst(data.results) : [];
  const unread = data?.unread_count ?? 0;

  return (
    <section className="glass-card" data-testid="notif-feed" style={{ marginTop: 8 }}>
      <div className="section-head">
        <h2>Notifications</h2>
        <span style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Entry point to the SMS opt-out screen — the sidebar no longer
              carries a Notifications item (it must stay byte-identical to the
              Django golden shell), so this feed header is where the doctor
              reaches notification settings. */}
          <Link className="notif-mark-all" data-testid="notif-settings-link" to="/notifications">
            SMS settings
          </Link>
          <button
            type="button"
            className="notif-mark-all"
            data-testid="notif-mark-all"
            // Only enabled when there is something unread to clear.
            disabled={unread <= 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            Mark all as read
          </button>
        </span>
      </div>

      {isLoading ? (
        <p className="notif-empty">Loading notifications&#8230;</p>
      ) : isError ? (
        <p className="notif-empty">Could not load notifications. Please try again.</p>
      ) : items.length === 0 ? (
        // AC-04 — graceful empty state.
        <p className="notif-empty" data-testid="notif-empty">
          You&#8217;re all caught up. No notifications yet.
        </p>
      ) : (
        <ul className="notif-feed">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                data-testid="notif-item"
                data-unread={n.is_read ? "false" : "true"}
                className={n.is_read ? "notif-item" : "notif-item unread"}
                // Per-item mark-read: clicking a still-unread row marks just it
                // read; already-read rows are inert (no redundant request).
                disabled={n.is_read || (markRead.isPending && markRead.variables === n.id)}
                aria-label={
                  n.is_read ? n.message : `Mark as read: ${n.message}`
                }
                onClick={() => {
                  if (!n.is_read) markRead.mutate(n.id);
                }}
              >
                <span className="notif-item-icon" aria-hidden="true">
                  {iconFor(n.type)}
                </span>
                <span className="notif-item-body">
                  <span className="notif-item-msg">{n.message}</span>
                  <time className="notif-item-time" dateTime={n.created_at}>
                    {formatWhen(n.created_at)}
                  </time>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
