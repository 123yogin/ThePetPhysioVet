import { useTitle } from "../lib/useTitle";
import { useNotifications, useMarkAllRead, useMarkRead } from "../api/notifications";

const muted = { color: "var(--brown-500)" };

// Owner notifications feed (SRS §3.7). Uses the shared /notifications endpoint,
// which scopes to the authenticated user — the owner sees only their own.
export default function OwnerNotificationsScreen() {
  useTitle("Notifications — ThePetPhysioVet");
  const { data, isLoading, isError } = useNotifications(50);
  const markAll = useMarkAllRead();
  const markOne = useMarkRead();

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="page-title">Notifications</h1>
        {data && data.unread_count > 0 ? (
          <button type="button" className="btn btn-ghost" disabled={markAll.isPending} onClick={() => markAll.mutate()}>
            Mark all read
          </button>
        ) : null}
      </div>
      <div className="panel">
        {isLoading ? (
          <p style={{ marginTop: 0 }}>Loading…</p>
        ) : isError ? (
          <p style={{ marginTop: 0 }}>Could not load notifications.</p>
        ) : data && data.results.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.results.map((n) => (
              <div
                key={n.id}
                onClick={() => { if (!n.is_read) markOne.mutate(n.id); }}
                style={{
                  borderTop: "1px solid rgba(62,39,35,.08)",
                  paddingTop: 10,
                  cursor: n.is_read ? "default" : "pointer",
                  fontWeight: n.is_read ? 400 : 600,
                }}
              >
                <div>{n.message}</div>
                <div style={{ fontSize: 12, ...muted }}>
                  {n.type_display || n.type} · {new Date(n.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ ...muted, marginTop: 0 }}>No notifications yet.</p>
        )}
      </div>
    </>
  );
}
