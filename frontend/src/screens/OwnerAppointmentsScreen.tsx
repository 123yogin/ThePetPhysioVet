import { useState } from "react";
import { useTitle } from "../lib/useTitle";
import {
  useOwnerAppointments,
  useOwnerAcceptAppointment,
  useOwnerRescheduleRequest,
} from "../api/owner";

const muted = { color: "var(--brown-500)" };

// Owner appointments (SRS §3.6): accept a pending booking or request a new time.
export default function OwnerAppointmentsScreen() {
  useTitle("My appointments — ThePetPhysioVet");
  const { data, isLoading, isError } = useOwnerAppointments();
  const accept = useOwnerAcceptAppointment();
  const reqResch = useOwnerRescheduleRequest();
  const [openId, setOpenId] = useState<number | null>(null);
  const [d, setD] = useState("");
  const [t, setT] = useState("");
  const [reason, setReason] = useState("");

  function send(id: number) {
    reqResch.mutate(
      { id, date: d, time: t, reason },
      { onSuccess: () => { setOpenId(null); setD(""); setT(""); setReason(""); } },
    );
  }

  return (
    <>
      <h1 className="page-title">My appointments</h1>
      <p className="page-sub">Accept a booking, or request a new time.</p>
      <div className="panel">
        {isLoading ? (
          <p style={{ marginTop: 0 }}>Loading…</p>
        ) : isError ? (
          <p style={{ marginTop: 0 }}>Could not load your appointments.</p>
        ) : data && data.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {data.map((a) => (
              <div key={a.id} style={{ borderTop: "1px solid rgba(62,39,35,.08)", paddingTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <span>
                    <strong>{a.pet_name}</strong>{" "}
                    <span style={muted}>· {a.date} {a.time} · {a.visit_type_display || a.visit_type}</span>
                  </span>
                  <span>{a.status}</span>
                </div>
                {a.status === "Reschedule Requested" && a.requested_date ? (
                  <p style={{ ...muted, margin: "6px 0" }}>
                    Requested: {a.requested_date} {a.requested_time} — {a.reschedule_reason}
                  </p>
                ) : null}
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  {a.status === "Pending" ? (
                    <button className="btn btn-primary" disabled={accept.isPending} onClick={() => accept.mutate(a.id)}>
                      Accept
                    </button>
                  ) : null}
                  {a.status !== "Cancelled" && a.status !== "Completed" ? (
                    <button className="btn btn-ghost" onClick={() => setOpenId(openId === a.id ? null : a.id)}>
                      {openId === a.id ? "Close" : "Request reschedule"}
                    </button>
                  ) : null}
                </div>
                {openId === a.id ? (
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <label>New date<br /><input type="date" className="input-glass" value={d} onChange={(e) => setD(e.target.value)} /></label>
                    <label>New time<br /><input type="time" className="input-glass" value={t} onChange={(e) => setT(e.target.value)} /></label>
                    <label style={{ flex: 1, minWidth: 160 }}>Reason<br /><input type="text" className="input-glass" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why the change?" /></label>
                    <button className="btn btn-primary" disabled={reqResch.isPending || !d || !t || !reason} onClick={() => send(a.id)}>
                      Send request
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ ...muted, marginTop: 0 }}>No appointments yet.</p>
        )}
      </div>
    </>
  );
}
