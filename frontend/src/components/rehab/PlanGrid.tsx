import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RehabSession, TreatmentPlan } from '../../lib/types';
import { todayISO } from '../../lib/dates';
import { dateRange, dayMonth, longDate, weekdayShort } from '../../lib/rehabDates';
import { extendTreatmentPlan, updateTreatmentPlan } from '../../api/treatment';
import { useFlash } from '../../lib/flash';
import { SessionActions } from './SessionActions';
import { ConfirmDialog } from '../ConfirmDialog';

interface Props {
  plan: TreatmentPlan;
  /** Owners (and anyone who must not tick) get a display-only grid. */
  readOnly?: boolean;
  /** Doctor only: open the builder for this plan. */
  onEdit?: () => void;
}

const GLYPH: Record<string, { mark: string; label: string; cls: string }> = {
  DONE: { mark: '✓', label: 'Done', cls: 'done' },
  DONE_LATE: { mark: '✓', label: 'Done late', cls: 'late' },
  MISSED: { mark: '✗', label: 'Missed', cls: 'missed' },
  SKIPPED: { mark: '–', label: 'Skipped', cls: 'skipped' },
  DUE: { mark: '○', label: 'Due', cls: 'due' },
};

function describe(s: RehabSession, showWho = true): string {
  if (s.display_status === 'DONE_LATE' && s.done_on) {
    return `planned ${weekdayShort(s.planned_date)}, done ${weekdayShort(s.done_on)}`;
  }
  if (s.display_status === 'DONE' && showWho && s.done_by_name) return `Done by ${s.done_by_name}`;
  if (s.display_status === 'SKIPPED' && s.skip_reason) return `Skipped: ${s.skip_reason}`;
  return GLYPH[s.display_status]?.label ?? s.display_status;
}

/** Clinic-local (Asia/Kolkata) calendar day of an ISO timestamp. */
function clinicDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(iso));
}

export const PlanGrid: React.FC<Props> = ({ plan, readOnly = false, onEdit }) => {
  const qc = useQueryClient();
  const { addFlash } = useFlash();
  const today = todayISO();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  const sessions = useMemo(() => plan.sessions ?? [], [plan.sessions]);
  const byKey = useMemo(() => {
    const m = new Map<string, RehabSession>();
    sessions.forEach((s) => m.set(`${s.therapy}|${s.planned_date}`, s));
    return m;
  }, [sessions]);
  const therapies = useMemo(
    () => Array.from(new Set([...(plan.schedule ?? []).map((e) => e.therapy), ...sessions.map((s) => s.therapy)])),
    [plan.schedule, sessions],
  );
  const dates = useMemo(() => {
    if (sessions.length === 0) return [];
    const planned = sessions.map((s) => s.planned_date).sort();
    const start = plan.start_date < planned[0] ? plan.start_date : planned[0];
    const last = planned[planned.length - 1];
    const end = plan.end_date && plan.end_date > last ? plan.end_date : last;
    return dateRange(start, end);
  }, [sessions, plan.start_date, plan.end_date]);

  const cellsReadOnly = readOnly || plan.status !== 'ACTIVE';
  const selected = sessions.find((s) => s.id === selectedId) ?? null;
  // Move focus into the panel when it opens, so keyboard users land on the actions.
  useEffect(() => {
    if (selectedId) panelRef.current?.focus();
  }, [selectedId]);

  const closePanel = () => {
    setSelectedId(null);
    // Hand focus back to the cell that opened the panel (it stays mounted).
    openerRef.current?.focus();
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['treatmentPlans'] });
    qc.invalidateQueries({ queryKey: ['rehabToday'] });
  };
  const extend = useMutation({
    mutationFn: () => extendTreatmentPlan(plan.id, 7),
    onSuccess: () => {
      addFlash('Plan extended by 7 days', 'success');
      refresh();
    },
    onError: (e: Error) => addFlash(e.message || 'Could not extend the plan', 'error'),
  });
  // Live QA B4: "Mark complete" closed the plan on one tap. Ask first.
  const [confirmComplete, setConfirmComplete] = useState(false);
  const complete = useMutation({
    mutationFn: () => updateTreatmentPlan(plan.id, { status: 'COMPLETED' }),
    onSuccess: () => {
      addFlash('Plan marked complete', 'success');
      setConfirmComplete(false);
      refresh();
    },
    onError: (e: Error) => addFlash(e.message || 'Could not complete the plan', 'error'),
  });

  const total = sessions.length;
  const done = sessions.filter((s) => s.status === 'DONE').length;
  const late = sessions.filter((s) => s.display_status === 'DONE_LATE').length;
  const skipped = sessions.filter((s) => s.status === 'SKIPPED').length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const showBanner = !readOnly && plan.status === 'ACTIVE' && !!plan.end_date && today >= plan.end_date;

  // An in-progress plan can be closed early; Extend stays at/after the end date.
  const showEarlyComplete = !readOnly && plan.status === 'ACTIVE' && !showBanner;

  return (
    <div className="rehab-grid-wrap">
      <ConfirmDialog
        open={confirmComplete}
        title="Mark this plan complete?"
        body={
          total > 0
            ? `${done} of ${total} sessions are done. Remaining sessions stop being due and the checklist becomes read-only.`
            : 'The plan will be closed and the checklist becomes read-only.'
        }
        confirmLabel="Mark complete"
        cancelLabel="Keep it active"
        busy={complete.isPending}
        onConfirm={() => complete.mutate()}
        onClose={() => setConfirmComplete(false)}
      />
      {showEarlyComplete && (
        <div className="rehab-actions" style={{ marginBottom: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" disabled={complete.isPending} onClick={() => setConfirmComplete(true)}>
            {complete.isPending ? 'Saving…' : 'Mark complete'}
          </button>
        </div>
      )}
      {showBanner && (
        <div className="alert alert-info rehab-banner" role="status">
          <span>This plan {today === plan.end_date ? 'ends today' : 'has ended'}. What next?</span>
          <div className="rehab-actions">
            <button type="button" className="btn btn-primary btn-sm" disabled={extend.isPending} onClick={() => extend.mutate()}>
              {extend.isPending ? 'Extending…' : 'Extend 7 days'}
            </button>
            {onEdit && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}>
                Edit
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" disabled={complete.isPending} onClick={() => setConfirmComplete(true)}>
              {complete.isPending ? 'Saving…' : 'Mark complete'}
            </button>
          </div>
        </div>
      )}

      {plan.status !== 'ACTIVE' && (
        <p className="rehab-closed-summary" role="status" style={{ color: 'var(--brown-500)', margin: '0 0 8px' }}>
          {plan.status === 'COMPLETED'
            ? `${plan.completed_at ? `Completed on ${longDate(clinicDay(plan.completed_at))} · ` : 'Completed · '}`
            : 'Paused · '}
          {/* Completing deletes the future DUE sessions, so the originally planned
              total is gone: report only what was done. */}
          {done} {done === 1 ? 'session' : 'sessions'} done
        </p>
      )}
      {total === 0 ? (
        plan.status === 'ACTIVE' && (
          <p style={{ color: 'var(--brown-500)' }}>No sessions are scheduled for this plan yet.</p>
        )
      ) : (
        <>
          <div className="rehab-progress">
            <div
              className="rehab-progress-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={done}
              aria-label="Sessions done"
            >
              <span style={{ width: `${pct}%` }} />
            </div>
            <span className="rehab-progress-text">
              {plan.status === 'ACTIVE' ? `${done} of ${total} done · ` : ''}{late} late · {skipped} skipped
            </span>
          </div>

          <div className="rehab-scroll" tabIndex={0} role="region" aria-label="Rehab checklist, scrolls sideways">
            <table className="rehab-grid">
              <thead>
                <tr>
                  <th scope="col" className="rehab-therapy">Therapy</th>
                  {dates.map((d) => (
                    <th key={d} scope="col" className={d === today ? 'rehab-today' : undefined}>
                      <span>{weekdayShort(d)}</span>
                      <span className="rehab-dm">{dayMonth(d)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {therapies.map((t) => (
                  <tr key={t}>
                    <th scope="row" className="rehab-therapy">{t}</th>
                    {dates.map((d) => {
                      const s = byKey.get(`${t}|${d}`);
                      if (!s) return <td key={d} className={d === today ? 'rehab-today' : undefined} />;
                      const g = GLYPH[s.display_status] ?? GLYPH.DUE;
                      const text = `${t}, ${longDate(d)}: ${describe(s, !readOnly)}`;
                      const content = (
                        <>
                          <span aria-hidden="true">{g.mark}</span>
                          <span className="rehab-sr">{text}</span>
                        </>
                      );
                      return (
                        <td key={d} className={d === today ? 'rehab-today' : undefined}>
                          {cellsReadOnly ? (
                            <span className={`rehab-cell ${g.cls}`} title={describe(s, !readOnly)}>{content}</span>
                          ) : (
                            <button
                              type="button"
                              className={`rehab-cell ${g.cls}${selectedId === s.id ? ' selected' : ''}`}
                              title={describe(s)}
                              aria-expanded={selectedId === s.id}
                              onClick={(e) => {
                                if (selectedId === s.id) {
                                  setSelectedId(null);
                                } else {
                                  openerRef.current = e.currentTarget;
                                  setSelectedId(s.id);
                                }
                              }}
                            >
                              {content}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="rehab-legend" aria-label="Legend">
            {Object.values(GLYPH).map((g) => (
              <li key={g.label}>
                <span className={`rehab-key ${g.cls}`} aria-hidden="true">{g.mark}</span> {g.label}
              </li>
            ))}
          </ul>

          {!cellsReadOnly && selected && (
            <div
              ref={panelRef}
              tabIndex={-1}
              role="group"
              aria-label={`${selected.therapy} on ${longDate(selected.planned_date)}`}
              className="rehab-panel"
              onKeyDown={(e) => {
                if (e.key === 'Escape') closePanel();
              }}
            >
              <div className="rehab-panel-head">
                <strong>{selected.therapy}</strong> · {longDate(selected.planned_date)} · {describe(selected)}
                <button type="button" className="btn btn-ghost btn-sm" onClick={closePanel}>
                  Close
                </button>
              </div>
              <SessionActions key={`${selected.id}-${selected.status}`} session={selected} onChanged={closePanel} />
            </div>
          )}
        </>
      )}
    </div>
  );
};
