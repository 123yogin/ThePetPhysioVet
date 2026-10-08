import React, { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchRehabCatalogue, rehabCatalogueKey, TreatmentPlanInput } from '../../api/treatment';
import { RehabFrequency, ScheduleEntry, TreatmentPlan } from '../../lib/types';
import { todayISO } from '../../lib/dates';
import { addDaysISO, dateRange, longDate, parseISO } from '../../lib/rehabDates';
import { Icon } from '../Icon';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
type Duration = '7' | '14' | '28' | 'custom';
const DURATIONS: { value: Duration; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '28', label: '28 days' },
  { value: 'custom', label: 'Custom' },
];

type Entry = { frequency: RehabFrequency; weekdays: number[] };

/** 0 = Mon .. 6 = Sun, matching the backend's `date.weekday()`. */
const weekdayIndex = (iso: string) => (parseISO(iso).getDay() + 6) % 7;

/**
 * Planned session count for one therapy — a client-side mirror of
 * `generate_dates` in backend/appointments/rehab.py, used only for the summary.
 */
function countSessions(start: string, end: string, entry: Entry): number {
  if (!start || !end || end < start) return 0;
  const days = dateRange(start, end);
  switch (entry.frequency) {
    case 'EVERYDAY':
      return days.length;
    case 'ALTERNATE_DAY':
      return Math.ceil(days.length / 2);
    case 'TWICE_WEEKLY':
    case 'WEEKLY':
    case 'BIWEEKLY': {
      const hits = days.filter((d) => entry.weekdays.includes(weekdayIndex(d))).length;
      return entry.frequency === 'BIWEEKLY' ? Math.ceil(hits / 2) : hits;
    }
    default:
      return 0;
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface Props {
  /** When set, the builder edits this plan (start date is fixed). */
  plan?: TreatmentPlan;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (payload: TreatmentPlanInput) => void;
  onCancel?: () => void;
}

export const PlanBuilder: React.FC<Props> = ({ plan, submitting, submitLabel, onSubmit, onCancel }) => {
  const editing = !!plan;
  const uid = useId();
  const errorListRef = useRef<HTMLDivElement>(null);
  const { data: catalogue, isLoading, isError, refetch } = useQuery({
    queryKey: rehabCatalogueKey,
    queryFn: fetchRehabCatalogue,
    staleTime: 10 * 60 * 1000,
  });

  const [entries, setEntries] = useState<Record<string, Entry>>(() => {
    const init: Record<string, Entry> = {};
    (plan?.schedule ?? []).forEach((e) => {
      init[e.therapy] = { frequency: e.frequency, weekdays: e.weekdays };
    });
    return init;
  });
  const [start, setStart] = useState(plan?.start_date ?? todayISO());
  const [duration, setDuration] = useState<Duration>(editing ? 'custom' : '7');
  const [customEnd, setCustomEnd] = useState(editing ? (plan?.end_date ?? '') : addDaysISO(todayISO(), 6));
  const [submitted, setSubmitted] = useState(false);
  // Bumped on every failed submit so focus moves to the error list each time.
  const [failedAttempts, setFailedAttempts] = useState(0);
  useEffect(() => {
    if (failedAttempts) errorListRef.current?.focus();
  }, [failedAttempts]);

  const required = (code: string) => catalogue?.frequencies.find((f) => f.code === code)?.weekdays_required ?? 0;
  const endDate = duration === 'custom' ? customEnd : addDaysISO(start, Number(duration) - 1);

  const toggleTherapy = (name: string, on: boolean) =>
    setEntries((prev) => {
      const next = { ...prev };
      if (on) next[name] = { frequency: 'EVERYDAY', weekdays: [] };
      else delete next[name];
      return next;
    });

  const setFrequency = (name: string, frequency: RehabFrequency) =>
    setEntries((prev) => ({ ...prev, [name]: { frequency, weekdays: [] } }));

  const toggleDay = (name: string, day: number) =>
    setEntries((prev) => {
      const cur = prev[name];
      const need = required(cur.frequency);
      const has = cur.weekdays.includes(day);
      if (!has && cur.weekdays.length >= need) return prev;
      const weekdays = has ? cur.weekdays.filter((d) => d !== day) : [...cur.weekdays, day].sort((a, b) => a - b);
      return { ...prev, [name]: { ...cur, weekdays } };
    });

  // Catalogue order keeps the schedule list (and the saved grid rows) stable.
  const ordered = (catalogue?.groups ?? []).flatMap((g) => g.therapies).filter((t) => entries[t]);
  const selected = ordered;

  const dayError = (name: string): string | null => {
    const need = required(entries[name].frequency);
    const have = entries[name].weekdays.length;
    return have === need ? null : `Pick ${need} weekday${need === 1 ? '' : 's'} for ${name}.`;
  };

  const errors: string[] = [];
  if (selected.length === 0) errors.push('Pick at least one therapy.');
  selected.forEach((n) => {
    const e = dayError(n);
    if (e) errors.push(e);
  });
  if (!start) errors.push('Choose a start date.');
  // Editing an open-ended plan may leave the end date blank (stays open).
  const openEnded = editing && !endDate;
  const dateRangeBad = !openEnded && (!endDate || endDate < start);
  if (dateRangeBad) errors.push('The end date must be on or after the start date.');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (errors.length) {
      setFailedAttempts((n) => n + 1);
      return;
    }
    const schedule: ScheduleEntry[] = selected.map((t) => ({ therapy: t, ...entries[t] }));
    onSubmit({
      schedule,
      therapies: selected,
      ...(editing ? {} : { start_date: start }),
      ...(openEnded ? {} : { end_date: endDate }),
    });
  };

  if (isLoading) return <p role="status" className="pb-muted">Loading therapies…</p>;
  if (isError || !catalogue) {
    return (
      <div className="alert alert-danger pb-load-error">
        <span>Could not load the therapy list.</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => refetch()}>Retry</button>
      </div>
    );
  }

  // Live summary. Sessions are only counted once every therapy has its days.
  const allComplete = selected.length > 0 && selected.every((n) => !dayError(n));
  const sessions =
    allComplete && start && endDate && !dateRangeBad
      ? selected.reduce((sum, n) => sum + countSessions(start, endDate, entries[n]), 0)
      : null;
  const rangeText = !start
    ? 'no start date'
    : openEnded
      ? `${longDate(start)} → open-ended`
      : endDate && !dateRangeBad
        ? `${longDate(start)} → ${longDate(endDate)}`
        : `${longDate(start)} → end date needed`;
  const summaryParts = [
    selected.length ? plural(selected.length, 'therapy', 'therapies') : 'No therapies yet',
    sessions !== null ? plural(sessions, 'session', 'sessions') : selected.length && !allComplete ? 'pick days to count sessions' : null,
    rangeText,
  ].filter(Boolean);

  const showErrors = submitted && errors.length > 0;

  return (
    <form onSubmit={handleSubmit} noValidate className="pb">
      {showErrors && (
        <div ref={errorListRef} tabIndex={-1} className="alert alert-danger pb-errors" role="alert">
          <strong>Please fix {errors.length === 1 ? 'this' : 'these'} before saving:</strong>
          <ul>
            {errors.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </div>
      )}

      {/* 1. Therapy picker */}
      <section className="pb-section" aria-labelledby={`${uid}-h-therapies`}>
        <div className="pb-section-head">
          <h4 id={`${uid}-h-therapies`}>Therapies</h4>
          <span className="pb-muted">{selected.length} selected</span>
        </div>
        {catalogue.groups.map((g) => (
          <fieldset key={g.group} className="pb-group">
            <legend>{g.group}</legend>
            <div className="pb-tiles">
              {g.therapies.map((t) => {
                const on = !!entries[t];
                return (
                  <label key={t} className={`pb-tile${on ? ' on' : ''}`}>
                    <input
                      type="checkbox"
                      className="pb-tile-input"
                      checked={on}
                      disabled={submitting}
                      onChange={(e) => toggleTherapy(t, e.target.checked)}
                    />
                    <span className="pb-tile-box" aria-hidden="true">
                      {on && <Icon name="check" size={14} />}
                    </span>
                    <span className="pb-tile-name">{t}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </section>

      {/* 2. Schedule for the selected therapies */}
      <section className="pb-section" aria-labelledby={`${uid}-h-schedule`}>
        <div className="pb-section-head">
          <h4 id={`${uid}-h-schedule`}>Schedule</h4>
        </div>
        {selected.length === 0 ? (
          <p className="pb-empty">Pick therapies above to set how often each one happens.</p>
        ) : (
          <ul className="pb-rows">
            {selected.map((t) => {
              const entry = entries[t];
              const need = required(entry.frequency);
              const have = entry.weekdays.length;
              const err = submitted ? dayError(t) : null;
              const hintId = `${uid}-hint-${t.replace(/[^a-z0-9]/gi, '')}`;
              return (
                <li key={t} className={`pb-row${err ? ' invalid' : ''}`}>
                  <span className="pb-row-name">{t}</span>
                  <select
                    aria-label={`Frequency for ${t}`}
                    className="input-glass pb-row-freq"
                    value={entry.frequency}
                    disabled={submitting}
                    onChange={(e) => setFrequency(t, e.target.value as RehabFrequency)}
                  >
                    {catalogue.frequencies.map((f) => (
                      <option key={f.code} value={f.code}>{f.label}</option>
                    ))}
                  </select>
                  <div className="pb-row-days">
                    {need > 0 && (
                      <>
                        <div role="group" aria-label={`Weekdays for ${t}`} aria-describedby={hintId} className="pb-chips">
                          {WEEKDAYS.map((w, i) => {
                            const dayOn = entry.weekdays.includes(i);
                            return (
                              <button
                                key={w}
                                type="button"
                                className={`rehab-chip pb-chip${dayOn ? ' on' : ''}`}
                                aria-pressed={dayOn}
                                aria-label={WEEKDAY_NAMES[i]}
                                disabled={submitting || (!dayOn && have >= need)}
                                onClick={() => toggleDay(t, i)}
                              >
                                {w}
                              </button>
                            );
                          })}
                        </div>
                        <span id={hintId} className={`pb-hint${err ? ' error' : have === need ? ' ok' : ''}`}>
                          {err && <Icon name="warning" size={13} />}
                          {have === need ? (
                            <><Icon name="check" size={13} /> {need === 1 ? 'Day set' : 'Days set'}</>
                          ) : (
                            `Pick ${need - have}${have ? ' more' : ''}`
                          )}
                        </span>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    className="pb-remove"
                    disabled={submitting}
                    onClick={() => toggleTherapy(t, false)}
                  >
                    <Icon name="close" size={16} label={`Remove ${t}`} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 3. Plan dates */}
      <section className="pb-section" aria-labelledby={`${uid}-h-dates`}>
        <div className="pb-section-head">
          <h4 id={`${uid}-h-dates`}>Plan dates</h4>
        </div>
        <div className="pb-dates">
          <div className="field">
            <label htmlFor={`${uid}-start`}>Start date</label>
            <input
              id={`${uid}-start`}
              type="date"
              className="input-glass"
              value={start}
              disabled={editing || submitting}
              aria-describedby={editing ? `${uid}-start-note` : undefined}
              onChange={(e) => setStart(e.target.value)}
            />
            {editing && <span id={`${uid}-start-note`} className="pb-field-note">Fixed once a plan has started.</span>}
          </div>
          <fieldset className="field pb-duration">
            <legend>Duration</legend>
            <div className="pb-seg">
              {DURATIONS.map((d) => (
                <label key={d.value} className={`pb-seg-opt${duration === d.value ? ' on' : ''}`}>
                  <input
                    type="radio"
                    name={`${uid}-duration`}
                    value={d.value}
                    checked={duration === d.value}
                    disabled={submitting}
                    onChange={() => setDuration(d.value)}
                  />
                  <span>{d.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="field">
            <label htmlFor={`${uid}-end`}>End date</label>
            {duration === 'custom' ? (
              <input
                id={`${uid}-end`}
                type="date"
                className="input-glass"
                value={customEnd}
                min={start}
                disabled={submitting}
                aria-invalid={submitted && dateRangeBad}
                aria-describedby={`${uid}-end-note`}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            ) : (
              <input
                id={`${uid}-end`}
                type="text"
                readOnly
                className="input-glass pb-readonly"
                value={endDate ? longDate(endDate) : ''}
                aria-describedby={`${uid}-end-note`}
              />
            )}
            <span id={`${uid}-end-note`} className={`pb-field-note${submitted && dateRangeBad ? ' error' : ''}`}>
              {submitted && dateRangeBad
                ? 'Must be on or after the start date.'
                : duration === 'custom'
                  ? editing
                    ? 'Leave blank to keep the plan open-ended.'
                    : 'Choose the last day of the plan.'
                  : 'Set by the duration.'}
            </span>
          </div>
        </div>
      </section>

      <div className="pb-footer">
        <p className="pb-summary" aria-live="polite">
          {summaryParts.map((p, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span aria-hidden="true" className="pb-dot">·</span>}
              <span>{p}</span>
            </React.Fragment>
          ))}
        </p>
        <div className="rehab-actions">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : submitLabel}
          </button>
          {onCancel && (
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </form>
  );
};
