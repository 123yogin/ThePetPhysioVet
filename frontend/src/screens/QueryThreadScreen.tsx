import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useTitle } from "../lib/useTitle";
import { usePetQueryThread, useSendQueryReply } from "../api/queries";
import { ApiError } from "../lib/http";
import { dateTimeMedium, humanSize } from "../lib/clinical";
import type { QueryAttachment, ThreadMessage } from "../lib/types";

// ----- Client-side attachment rules (MIRROR the server: 0–5 JPEG/PNG ≤5MB) ---
// The server re-validates and rejects 6+/wrong-type/oversized atomically; this
// is the fast inline pre-check so the doctor sees an .alert-danger BEFORE any
// bytes upload.
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME = ["image/jpeg", "image/png"];

function validateAttachments(files: File[]): string | null {
  if (files.length > MAX_ATTACHMENTS) {
    return `Attach at most ${MAX_ATTACHMENTS} images (you selected ${files.length}).`;
  }
  for (const f of files) {
    if (!ALLOWED_MIME.includes(f.type)) {
      return `${f.name}: only JPEG or PNG images are allowed.`;
    }
    if (f.size > MAX_ATTACHMENT_BYTES) {
      return `${f.name}: exceeds the 5MB limit.`;
    }
  }
  return null;
}

// Sprint 7 (B) — Doctor query thread (SRS §3.9, US-QUERY-03). Route
// /queries/:petId. NEW screen (no Django golden), vet.css classes only. Renders
// the pet's append-only thread oldest→newest with clear owner/doctor
// attribution + inline image thumbnails, plus a reply composer. APPEND-ONLY:
// there are deliberately NO edit or delete affordances anywhere on this screen.
export default function QueryThreadScreen() {
  const { petId: petIdParam } = useParams();
  const petId = Number(petIdParam);

  const { data: thread, isLoading, isError, error } = usePetQueryThread(petId);
  const notFound = error instanceof ApiError && error.status === 404;
  useTitle(`${thread?.pet.name ?? "Query thread"} — ThePetPhysioVet`);

  const send = useSendQueryReply(petId);

  // Controlled composer state.
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [clientError, setClientError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  // Remounts the file <input> to clear it after a successful send.
  const [formKey, setFormKey] = useState(0);

  const serverErr =
    send.error instanceof ApiError ? (send.error.data as Record<string, unknown>) : null;
  const serverFieldErr = (name: string): string | null => {
    const v = serverErr?.[name];
    if (Array.isArray(v)) return v.join(" ");
    if (typeof v === "string") return v;
    return null;
  };
  const nonFieldError =
    serverFieldErr("non_field_errors") ??
    serverFieldErr("detail") ??
    serverFieldErr("attachments") ??
    serverFieldErr("message");

  function onFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    setFiles(picked);
    setClientError(picked.length ? validateAttachments(picked) : null);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = message.trim();
    if (!text && files.length === 0) {
      setClientError("Enter a message or attach an image before sending.");
      return;
    }
    const pre = validateAttachments(files);
    if (pre) {
      setClientError(pre);
      return;
    }
    setClientError(null);
    setProgress(0);
    send.mutate(
      { message: text, attachments: files, onProgress: setProgress },
      {
        onSuccess: () => {
          // Hook invalidates ["queryThread", petId] + ["queryInbox"], so the new
          // message appends without a full reload. Just reset the composer.
          setMessage("");
          setFiles([]);
          setProgress(null);
          setFormKey((k) => k + 1);
        },
        onError: () => setProgress(null),
      },
    );
  }

  if (notFound) {
    return (
      <>
        <h1 className="page-title">Query thread</h1>
        <div className="panel">
          <p style={{ margin: 0 }}>
            Thread not found. <Link to="/queries">Back to queries</Link>.
          </p>
        </div>
      </>
    );
  }

  const messages = thread?.messages ?? [];

  return (
    <>
      <h1 className="page-title">{thread?.pet.name ?? "Query thread"}</h1>
      <p className="page-sub">
        {thread ? (
          <>
            {thread.pet.pet_type} · Owner: {thread.pet.owner_name} ·{" "}
            <Link to={`/patients/${thread.pet.id}`}>Patient record</Link> ·{" "}
            <Link to="/queries">All queries</Link>
          </>
        ) : (
          <Link to="/queries">All queries</Link>
        )}
      </p>

      {/* ----- Thread (oldest → newest) ----- */}
      <div className="panel">
        {isLoading ? (
          <p style={{ margin: 0 }}>Loading messages…</p>
        ) : isError ? (
          <p style={{ margin: 0 }}>Could not load this thread. Please try again.</p>
        ) : messages.length === 0 ? (
          <p style={{ margin: 0 }}>No messages yet</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {messages.map((m) => (
              <MessageCard key={m.id} message={m} />
            ))}
          </div>
        )}
      </div>

      {/* ----- Reply composer (append-only: send adds a new message) ----- */}
      <div className="panel">
        <div className="section-head">
          <h2>Reply</h2>
        </div>
        <form className="form-grid" onSubmit={onSubmit} key={`reply-${formKey}`}>
          {nonFieldError ? (
            <div className="alert alert-danger full">{nonFieldError}</div>
          ) : null}

          <div className="full">
            <label htmlFor="id_query_message" style={{ display: "block", marginBottom: 6 }}>
              Message
            </label>
            <textarea
              id="id_query_message"
              name="message"
              className="input-glass"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write a reply to the owner…"
            />
          </div>

          <div className="full">
            <label htmlFor="id_query_attachments" style={{ display: "block", marginBottom: 6 }}>
              Images (optional — up to {MAX_ATTACHMENTS} JPEG/PNG, ≤5MB each)
            </label>
            <input
              id="id_query_attachments"
              name="attachments"
              type="file"
              className="input-glass"
              accept="image/jpeg,image/png"
              multiple
              onChange={onFilesChange}
            />
            {files.length > 0 ? (
              <p className="meta-row" style={{ marginTop: 6 }}>
                {files.length} file{files.length === 1 ? "" : "s"} selected:{" "}
                {files.map((f) => f.name).join(", ")}
              </p>
            ) : null}
          </div>

          {clientError ? <div className="alert alert-danger full">{clientError}</div> : null}

          {progress !== null ? (
            <div className="upload-progress full" aria-hidden="true">
              <span style={{ width: `${progress}%` }} />
            </div>
          ) : null}

          <div className="form-actions full">
            <button type="submit" className="btn btn-primary" disabled={send.isPending}>
              {send.isPending ? "Sending…" : "Send reply"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function MessageCard({ message }: { message: ThreadMessage }) {
  const isDoctor = message.sender_role === "DOCTOR";
  return (
    <div
      className="visit-card"
      style={{
        // Doctor replies lean right, owner messages left — quick visual sender cue.
        marginLeft: isDoctor ? "auto" : 0,
        marginRight: isDoctor ? 0 : "auto",
        maxWidth: "88%",
        width: "fit-content",
        minWidth: "min(320px, 100%)",
      }}
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
          {message.sender_name}{" "}
          <span className={`badge ${isDoctor ? "badge-completed" : "badge-pending"}`}>
            {isDoctor ? "Doctor" : "Owner"}
          </span>
        </h4>
        <span className="meta-row" style={{ margin: 0 }}>
          {dateTimeMedium(message.sent_at)}
        </span>
      </div>

      {message.message ? (
        <p className="meta-row" style={{ margin: "8px 0 0", whiteSpace: "pre-wrap" }}>
          {message.message}
        </p>
      ) : null}

      {message.attachments.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
          {message.attachments.map((a) => (
            <Thumbnail key={a.id} attachment={a} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Thumbnail({ attachment }: { attachment: QueryAttachment }) {
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${attachment.original_filename} (${humanSize(attachment.size)}) — open full size`}
      style={{ display: "inline-block", lineHeight: 0 }}
    >
      <img
        src={attachment.url}
        alt={attachment.original_filename}
        loading="lazy"
        style={{
          width: 96,
          height: 96,
          objectFit: "cover",
          borderRadius: 12,
          border: "1px solid rgba(62, 39, 35, 0.15)",
        }}
      />
    </a>
  );
}
