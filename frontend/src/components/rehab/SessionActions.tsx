import React, { useState } from 'react';
import { RehabSession } from '../../lib/types';
import { todayISO } from '../../lib/dates';
import { useSessionActions } from './useSessionActions';

interface Props {
  session: RehabSession;
  /** Called after a successful change (e.g. to close a popover). */
  onChanged?: () => void;
}

type Mode = 'idle' | 'on' | 'skip';

/** Done today / Done on… / Skip / Undo controls for one session (doctor only). */
export const SessionActions: React.FC<Props> = ({ session, onChanged }) => {
  const actions = useSessionActions(onChanged);
  const [mode, setMode] = useState<Mode>('idle');
  const [doneOn, setDoneOn] = useState(todayISO());
  const [reason, setReason] = useState('');
  const today = todayISO();
  const busy = actions.pending;
  const uid = `sa-${session.id}`;

  if (session.status !== 'DUE') {
    return (
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => actions.undo(session.id)}>
        {busy ? 'Undoing…' : 'Undo'}
      </button>
    );
  }

  if (mode === 'on') {
    return (
      <form
        className="rehab-inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          actions.done(session.id, doneOn);
        }}
      >
        <label htmlFor={`${uid}-on`}>Done on</label>
        <input
          id={`${uid}-on`}
          type="date"
          className="input-glass"
          value={doneOn}
          min={session.planned_date}
          max={today}
          onChange={(e) => setDoneOn(e.target.value)}
          required
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !doneOn}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode('idle')} disabled={busy}>
          Cancel
        </button>
      </form>
    );
  }

  if (mode === 'skip') {
    return (
      <form
        className="rehab-inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          actions.skip(session.id, reason.trim());
        }}
      >
        <label htmlFor={`${uid}-reason`}>Reason (optional)</label>
        <input
          id={`${uid}-reason`}
          className="input-glass"
          value={reason}
          maxLength={200}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. too tired"
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? 'Saving…' : 'Skip session'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode('idle')} disabled={busy}>
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className="rehab-actions">
      <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => actions.done(session.id)}>
        {busy ? 'Saving…' : 'Done today'}
      </button>
      {session.planned_date < today && (
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setMode('on')}>
          Done on…
        </button>
      )}
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setMode('skip')}>
        Skip
      </button>
    </div>
  );
};
