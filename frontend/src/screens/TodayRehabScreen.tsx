import React, { useId } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchRehabToday, rehabTodayKey } from '../api/treatment';
import { RehabTodaySession } from '../lib/types';
import { SessionActions } from '../components/rehab/SessionActions';
import { friendlyDate } from '../lib/labels';
import { longDate } from '../lib/rehabDates';

function groupByPet(items: RehabTodaySession[]) {
  const map = new Map<string, { pet: RehabTodaySession['pet']; items: RehabTodaySession[] }>();
  items.forEach((s) => {
    const g = map.get(s.pet.id) ?? { pet: s.pet, items: [] };
    g.items.push(s);
    map.set(s.pet.id, g);
  });
  return Array.from(map.values());
}

const Section: React.FC<{ title: string; hint: string; empty: string; items: RehabTodaySession[]; showPlanned: boolean }> = ({
  title,
  hint,
  empty,
  items,
  showPlanned,
}) => {
  const headingId = useId();
  return (
  <section className="glass-card" style={{ marginBottom: 24 }} aria-labelledby={headingId}>
    <h2 id={headingId} style={{ margin: '0 0 4px', fontSize: 18 }}>
      {title} ({items.length})
    </h2>
    <p style={{ margin: '0 0 16px', color: 'var(--brown-500)' }}>{hint}</p>
    {items.length === 0 ? (
      <p>{empty}</p>
    ) : (
      groupByPet(items).map((g) => (
        <div key={g.pet.id} className="rehab-pet-group">
          <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>
            <Link to={`/patients/${g.pet.id}?tab=treatment`} className="table-link">{g.pet.name}</Link>
          </h3>
          <ul className="rehab-list">
            {g.items.map((s) => (
              <li key={s.id} className="rehab-list-item">
                <div>
                  <strong>{s.therapy}</strong>
                  {showPlanned && <span style={{ color: 'var(--brown-500)' }}> · planned {longDate(s.planned_date)}</span>}
                  <div className={`rehab-status ${s.display_status.toLowerCase()}`}>
                    {s.display_status === 'DONE' && '✓ Done'}
                    {s.display_status === 'DONE_LATE' && '✓ Done late'}
                    {s.display_status === 'SKIPPED' && `– Skipped${s.skip_reason ? `: ${s.skip_reason}` : ''}`}
                    {s.display_status === 'MISSED' && '✗ Missed'}
                    {s.display_status === 'DUE' && '○ Due'}
                  </div>
                </div>
                <SessionActions key={`${s.id}-${s.status}`} session={s} />
              </li>
            ))}
          </ul>
        </div>
      ))
    )}
  </section>
  );
};

export const TodayRehabScreen: React.FC = () => {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: rehabTodayKey, queryFn: fetchRehabToday });

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 className="page-title">Today's rehab</h1>
        {data && <p style={{ color: 'var(--brown-500)' }}>{friendlyDate(data.today)} · {longDate(data.today)}</p>}
      </div>
      {isLoading && <p role="status">Loading today's sessions…</p>}
      {isError && (
        <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Could not load today's rehab sessions.</span>
          <button type="button" onClick={() => refetch()} className="btn btn-ghost btn-sm">Retry</button>
        </div>
      )}
      {data && (
        <>
          <Section
            title="Due today"
            hint="Tick each session as it is finished."
            empty="Nothing is scheduled for today. Create a rehab plan from a patient's Rehab Plans tab."
            items={data.due}
            showPlanned={false}
          />
          <Section
            title="Pending"
            hint="Earlier sessions that were never ticked. Record them as done (late) or skip them."
            empty="No missed sessions. Everything planned before today has been dealt with."
            items={data.pending}
            showPlanned
          />
        </>
      )}
    </div>
  );
};
