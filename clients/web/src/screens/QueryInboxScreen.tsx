import { Link } from "react-router-dom";
import { useTitle } from "../lib/useTitle";
import { useQueryInbox } from "../api/queries";
import { dateTimeMedium } from "../lib/clinical";
import type { InboxItem } from "../lib/types";

// Sprint 7 (B) — Doctor query inbox (SRS §3.9, US-QUERY-03). Route /queries.
// NEW screen (no Django golden), styled with vet.css classes only (.panel /
// .visit-card / .meta-row / .badge / .btn) — no new global styles. Threads come
// back from the API already ordered by last_message_at desc, so we render them
// as-is (most-recent-first). Each row links to that pet's append-only thread.
export default function QueryInboxScreen() {
  useTitle("Queries — ThePetPhysioVet");

  const { data: threads, isLoading, isError } = useQueryInbox();

  return (
    <>
      <h1 className="page-title">Queries</h1>
      <p className="page-sub">
        Owner questions per patient — most recent first. Open a thread to reply.
      </p>

      <div className="panel">
        {isLoading ? (
          <p style={{ margin: 0 }}>Loading query threads…</p>
        ) : isError ? (
          <p style={{ margin: 0 }}>Could not load query threads. Please try again.</p>
        ) : (threads ?? []).length === 0 ? (
          <p style={{ margin: 0 }}>No query threads</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {threads!.map((t) => (
              <InboxRow key={t.pet.id} item={t} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function InboxRow({ item }: { item: InboxItem }) {
  const { pet, last_message, awaiting_reply, message_count } = item;
  return (
    <Link
      to={`/queries/${pet.id}`}
      className="visit-card"
      style={{ display: "block", textDecoration: "none", color: "inherit" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <h4 style={{ margin: 0 }}>
          {pet.name} <span className="chip">{pet.pet_type}</span>
        </h4>
        {awaiting_reply ? (
          <span className="badge badge-pending">Awaiting reply</span>
        ) : (
          <span className="badge badge-completed">Replied</span>
        )}
      </div>

      <p className="meta-row">
        <strong>Owner:</strong> {pet.owner_name}
      </p>

      {last_message ? (
        <p className="meta-row" style={{ margin: "8px 0 0" }}>
          <strong>{last_message.sender_role === "DOCTOR" ? "You: " : ""}</strong>
          {last_message.snippet}
          <span style={{ display: "block", marginTop: 3, opacity: 0.8 }}>
            {dateTimeMedium(last_message.sent_at)}
            {" · "}
            {message_count} message{message_count === 1 ? "" : "s"}
          </span>
        </p>
      ) : (
        <p className="meta-row" style={{ margin: "8px 0 0" }}>
          No messages yet
        </p>
      )}
    </Link>
  );
}
