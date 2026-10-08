import React, { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchRehabCatalogue, rehabCatalogueKey, TreatmentPlanInput } from '../../api/treatment';
import { RehabFrequency, ScheduleEntry, TreatmentPlan } from '../../lib/types';
import { todayISO } from '../../lib/dates';
import { addDaysISO } from '../../lib/rehabDates';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
type Duration = '7' | '14' | '28' | 'custom';

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
  const { data: catalogue, isLoading, isError, refetch } = useQuery({
    queryKey: rehabCatalogueKey,
    queryFn: fetchRehabCatalogue,
    staleTime: 10 * 60 * 1000,
  });

  const [entries, setEntries] = useState<Record<string, { frequency: RehabFrequency; weekdays: number[] }>>(() => {
    const init: Record<string, { frequency: RehabFrequency; weekdays: number[] }> = {};
    (plan?.schedule ?? []).forEach((e) => {
      init[e.therapy] = { frequency: e.frequency, weekdays: e.weekdays };
    });
    return init;
  });
  const [start, setStart] = useState(plan?.start_date ?? todayISO());
  const [duration, setDuration] = useState<Duration>(editing ? 'custom' : '7');
  const [customEnd, setCustomEnd] = useState(editing ? (plan?.end_date ?? '') : addDaysISO(todayISO(), 6));
  const [submitted, setSubmitted] = useState(false);

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

  const names = Object.keys(entries);
  const errors: string[] = [];
  if (names.length === 0) errors.push('Tick at least one therapy.');
  names.forEach((n) => {
    const need = required(entries[n].frequency);
    if (entries[n].weekdays.length !== need) {
      errors.push(`${n}: pick ${need} weekday${need === 1 ? '' : 's'}.`);
    }
  });
  if (!start) errors.push('Choose a start date.');
  // Editing an open-ended plan may leave the end date blank (stays open).
  if (!(editing && !endDate) && (!endDate || endDate < start)) errors.push('The end date must be on or after the start date.');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (errors.length) return;
    // Keep catalogue order so the grid rows are stable.
    const ordered = (catalogue?.groups ?? []).flatMap((g) => g.therapies).filter((t) => entries[t]);
    const schedule: ScheduleEntry[] = ordered.map((t) => ({ therapy: t, ...entries[t] }));
    onSubmit({
      schedule,
      therapies: ordered,
      ...(editing ? {} : { start_date: start }),
      ...(editing && !endDate ? {} : { end_date: endDate }),
    });
  };

  if (isLoading) return <p role="status">Loading therapies…</p>;
  if (isError || !catalogue) {
    return (
      <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Could not load the therapy list.</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => refetch()}>Retry</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {catalogue.groups.map((g) => (
        <fieldset key={g.group} className="rehab-group">
          <legend>{g.group}</legend>
          {g.therapies.map((t) => {
            const entry = entries[t];
            const need = entry ? required(entry.frequency) : 0;
            const id = `${uid}-th-${t.replace(/[^a-z0-9]/gi, '')}`;
            return (
              <div key={t} className="rehab-therapy-row">
                <label className="rehab-check" htmlFor={id}>
                  <input id={id} type="checkbox" checked={!!entry} disabled={submitting} onChange={(e) => toggleTherapy(t, e.target.checked)} />
                  <span>{t}</span>
                </label>
                {entry && (
                  <div className="rehab-freq">
                    <select
                      aria-label={`Frequency for ${t}`}
                      className="input-glass"
                      value={entry.frequency}
                      disabled={submitting}
                      onChange={(e) => setFrequency(t, e.target.value as RehabFrequency)}
                    >
                      {catalogue.frequencies.map((f) => (
                        <option key={f.code} value={f.code}>{f.label}</option>
                      ))}
                    </select>
                    {need > 0 && (
                      <div role="group" aria-label={`Weekdays for ${t}, pick ${need}`} className="rehab-chips">
                        {WEEKDAYS.map((w, i) => {
                          const on = entry.weekdays.includes(i);
                          return (
                            <button
                              key={w}
                              type="button"
                              className={`rehab-chip${on ? ' on' : ''}`}
                              aria-pressed={on}
                              disabled={submitting || (!on && entry.weekdays.length >= need)}
                              onClick={() => toggleDay(t, i)}
                            >
                              {w}
                            </button>
                          );
                        })}
                        <span className="rehab-chip-hint">
                          {entry.weekdays.length}/{need} picked
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </fieldset>
      ))}

      <div className="form-row-3" style={{ margin: '16px 0' }}>
        <div className="field">
          <label htmlFor={`${uid}-start`}>Start date</label>
          <input id={`${uid}-start`} type="date" className="input-glass" value={start} disabled={editing || submitting} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`${uid}-duration`}>Duration</label>
          <select id={`${uid}-duration`} className="input-glass" value={duration} disabled={submitting} onChange={(e) => setDuration(e.target.value as Duration)}>
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="28">28 days</option>
            <option value="custom">Custom end date</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${uid}-end`}>End date</label>
          <input
            id={`${uid}-end`}
            type="date"
            className="input-glass"
            value={endDate}
            min={start}
            placeholder={editing ? 'Open-ended' : undefined}
            disabled={duration !== 'custom' || submitting}
            onChange={(e) => setCustomEnd(e.target.value)}
          />
        </div>
      </div>

      {submitted && errors.length > 0 && (
        <ul className="alert alert-danger" role="alert" style={{ paddingLeft: 28 }}>
          {errors.map((m) => <li key={m}>{m}</li>)}
        </ul>
      )}

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
    </form>
  );
};
