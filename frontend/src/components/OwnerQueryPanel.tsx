import { useState } from "react";
import { useOwnerQueryThread, useSendOwnerQuery } from "../api/owner";

const muted = { color: "var(--brown-500)" };

// Owner side of the pet's message thread (SRS §3.9). Read the append-only
// thread + send a new message (optionally with image attachments).
export default function OwnerQueryPanel({ petId }: { petId: number }) {
  const { data, isLoading, isError } = useOwnerQueryThread(petId);
  const send = useSendOwnerQuery(petId);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  function submit() {
    if (!text.trim() && files.length === 0) return;
    send.mutate(
      { message: text.trim(), attachments: files },
      { onSuccess: () => { setText(""); setFiles([]); } },
    );
  }

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>Messages with your clinic</h3>
      {isLoading ? (
        <p style={{ ...muted, marginTop: 0 }}>Loading…</p>
      ) : isError ? (
        <p style={{ ...muted, marginTop: 0 }}>Could not load messages.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
          {data && data.messages.length > 0 ? (
            data.messages.map((m) => {
              const mine = m.sender_role === "OWNER";
              return (
                <div
                  key={m.id}
                  style={{
                    alignSelf: mine ? "flex-end" : "flex-start",
                    maxWidth: "80%",
                    background: mine ? "var(--teal-100, #d9efec)" : "rgba(62,39,35,.06)",
                    borderRadius: 10,
                    padding: "8px 12px",
                  }}
                >
                  <div style={{ fontSize: 12, ...muted }}>
                    {mine ? "You" : m.sender_name} · {new Date(m.sent_at).toLocaleString()}
                  </div>
                  {m.message ? <div>{m.message}</div> : null}
                  {m.attachments?.map((a) => (
                    <div key={a.id}>
                      <a href={a.url} target="_blank" rel="noopener noreferrer">{a.original_filename}</a>
                    </div>
                  ))}
                </div>
              );
            })
          ) : (
            <p style={{ ...muted, marginTop: 0 }}>No messages yet. Ask your clinic a question below.</p>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <textarea
          className="input-glass"
          rows={2}
          placeholder="Write a message to your clinic…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <input
          type="file"
          accept="image/jpeg,image/png"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))}
        />
        {send.isError ? (
          <div className="alert alert-danger" role="alert">Could not send. Check the message and attachments (JPEG/PNG, ≤5MB, max 5).</div>
        ) : null}
        <div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={send.isPending || (!text.trim() && files.length === 0)}
            onClick={submit}
          >
            {send.isPending ? "Sending…" : "Send message"}
          </button>
        </div>
      </div>
    </div>
  );
}
