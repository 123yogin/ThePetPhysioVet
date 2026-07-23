import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTitle } from "../lib/useTitle";
import RichText from "../components/RichText";
import ConfirmDialog from "../components/ConfirmDialog";
import Field from "../components/Field";
import {
  useAddProgressNote,
  useTreatmentPlan,
  useUpdatePlan,
} from "../api/treatment";
import { ApiError } from "../lib/http";
import {
  dateTimeMedium,
  durationLabel,
  frequencyLabel,
  planStatusBadge,
  planStatusLabel,
  therapyLabel,
} from "../lib/clinical";
import { dateMedium } from "../lib/format";

// Treatment-plan detail (/patients/:id/plans/:pid). Plan summary + status badge,
// chronological progress-note history, add-note form (ACTIVE/ON_HOLD only), and
// a Mark Completed action that archives the plan (then it renders read-only).
export default function TreatmentPlanDetailScreen() {
  useTitle("Treatment plan — ThePetPhysioVet");
  const { id, pid } = useParams();
  const petId = Number(id);
  const planId = Number(pid);
  const queryClient = useQueryClient();

  const { data: plan, isLoading, error } = useTreatmentPlan(planId);
  const notFound = error instanceof ApiError && error.status === 404;

  const addNote = useAddProgressNote(planId);
  const update = useUpdatePlan(planId);

  const [noteHtml, setNoteHtml] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteKey, setNoteKey] = useState(0); // remount RichText to reset after add
  const [confirmComplete, setConfirmComplete] = useState(false);

  const isArchived = plan?.status === "COMPLETED";
  const canAddNotes = plan?.status === "ACTIVE" || plan?.status === "ON_HOLD";

  const notes = plan?.progress_notes ?? [];
  const nextSession = notes.reduce((max, n) => Math.max(max, n.session_no), 0) + 1;

  const noteServerErr =
    addNote.error instanceof ApiError ? (addNote.error.data as Record<string, string[]>) : null;
  const noteServerMsg = noteServerErr?.notes?.join(" ") ?? noteServerErr?.non_field_errors?.join(" ");

  // Strip tags to check the note actually has text (not just empty markup).
  function isEmptyHtml(html: string): boolean {
    return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() === "";
  }

  function onAddNote(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isEmptyHtml(noteHtml)) {
      setNoteError("Enter a progress note before saving.");
      return;
    }
    setNoteError(null);
    addNote.mutate(
      { session_no: nextSession, notes: noteHtml },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["treatment-plan", planId] });
          setNoteHtml("");
          setNoteKey((k) => k + 1);
        },
      },
    );
  }

  function onComplete() {
    update.mutate(
      { status: "COMPLETED" },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["treatment-plan", planId] });
          queryClient.invalidateQueries({ queryKey: ["treatment-plans", petId] });
          setConfirmComplete(false);
        },
      },
    );
  }

  return (
    <>
      <h1 className="page-title">Treatment plan</h1>
      <p className="page-sub">
        <Link to={`/patients/${petId}`}>&larr; Back to patient record</Link>
      </p>

      <div className="panel">
        {isLoading ? (
          <p style={{ margin: 0 }}>Loading plan…</p>
        ) : notFound ? (
          <p style={{ margin: 0 }}>Treatment plan not found.</p>
        ) : !plan ? (
          <p style={{ margin: 0 }}>Could not load plan. Please try again.</p>
        ) : (
          <>
            <div className="section-head">
              <h2>
                Plan{" "}
                <span className={`badge ${planStatusBadge(plan.status)}`}>
                  {planStatusLabel(plan.status)}
                </span>
              </h2>
              {!isArchived ? (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Link className="btn btn-sm btn-ghost" to={`/patients/${petId}/plans/${planId}/edit`}>
                    Edit
                  </Link>
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => setConfirmComplete(true)}>
                    Mark completed
                  </button>
                </div>
              ) : null}
            </div>

            {isArchived ? (
              <p className="readonly-note">
                This plan is completed and archived
                {plan.completed_at ? ` on ${dateTimeMedium(plan.completed_at)}` : ""} — read-only.
              </p>
            ) : null}

            <p className="meta-row">
              <strong>Therapies:</strong>{" "}
              {plan.therapies.map((t) => (
                <span className="chip" key={t}>{therapyLabel(t)}</span>
              ))}
            </p>
            <p className="meta-row">
              <strong>Frequency:</strong> {frequencyLabel(plan.frequency)}
              {plan.frequency === "CUSTOM" && plan.frequency_custom ? ` — ${plan.frequency_custom}` : ""}
            </p>
            <p className="meta-row">
              <strong>Duration:</strong> {durationLabel(plan.duration)}
              {plan.duration === "CUSTOM" && plan.duration_custom ? ` — ${plan.duration_custom}` : ""}
            </p>
            <p className="meta-row">
              <strong>Start:</strong> {dateMedium(plan.start_date)}
              {plan.end_date ? <> &nbsp;·&nbsp; <strong>End:</strong> {dateMedium(plan.end_date)}</> : null}
            </p>
          </>
        )}
      </div>

      {/* Progress notes */}
      {plan ? (
        <div className="panel">
          <div className="section-head">
            <h2>Progress notes</h2>
          </div>

          {notes.length === 0 ? (
            <p className="meta-row">No progress notes yet.</p>
          ) : (
            notes.map((n) => (
              <div className="note-item" key={n.id}>
                <div className="note-head">
                  <span className="note-session">Session {n.session_no}</span>
                  <span className="note-time">{dateTimeMedium(n.created_at)}</span>
                </div>
                <div className="rt-content" dangerouslySetInnerHTML={{ __html: n.notes }} />
              </div>
            ))
          )}

          {/* Add-note form: only for ACTIVE / ON_HOLD plans. */}
          {canAddNotes ? (
            <form onSubmit={onAddNote} style={{ marginTop: 16 }} key={`note-${noteKey}`}>
              <Field label={`Add note (session ${nextSession})`} htmlFor="id_note">
                <RichText
                  id="id_note"
                  value={noteHtml}
                  onChange={setNoteHtml}
                  ariaLabel="Progress note"
                  placeholder="What happened this session…"
                />
              </Field>
              {noteError ? <div className="alert alert-danger">{noteError}</div> : null}
              {noteServerMsg ? <div className="alert alert-danger">{noteServerMsg}</div> : null}
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={addNote.isPending}>
                  {addNote.isPending ? "Saving…" : "Add progress note"}
                </button>
              </div>
            </form>
          ) : isArchived ? (
            <p className="readonly-note" style={{ marginTop: 16, marginBottom: 0 }}>
              Notes are read-only on a completed plan.
            </p>
          ) : null}
        </div>
      ) : null}

      {confirmComplete ? (
        <ConfirmDialog
          title="Mark plan as completed?"
          message="Completing archives the plan. It becomes read-only — no further edits or new progress notes."
          confirmLabel="Mark completed"
          busy={update.isPending}
          onConfirm={onComplete}
          onCancel={() => setConfirmComplete(false)}
        />
      ) : null}
    </>
  );
}
