import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchBoardings, fetchBoardingMenu, updateBoardingStatus, createBoarding,
  boardingQueryKey, Boarding, BoardingAction,
} from '../api/boarding';
import { useFlash } from '../lib/flash';
import { todayISO } from '../lib/dates';
import { Icon } from '../components/Icon';
import { friendlyDate, formatMoney } from '../lib/labels';
import { isValidAadhaar } from '../lib/aadhaar';

/**
 * Indoor-facility BOARDING (duration-priced stays) — doctor inbox + check-in.
 *
 * Owners book on the website; doctors see the stays here, can enter one
 * themselves (the "+ New boarding" form), and move each through
 * confirm → check-in → complete (or cancel, which frees the beds). Price and
 * dates are computed server-side, so this screen only displays them.
 */

type StatusTab = 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'ALL';
const TABS: { key: StatusTab; label: string }[] = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'CHECKED_IN', label: 'Checked in' },
  { key: 'ALL', label: 'All' },
];

const BADGE_CLASS: Record<string, string> = {
  PENDING: 'badge-pending',
  CONFIRMED: 'badge-confirmed',
  CHECKED_IN: 'badge-confirmed',
  COMPLETED: 'badge-confirmed',
  CANCELLED: 'badge-cancelled',
};

const providerLabel = (v: string) => (v === 'clinic' ? 'clinic' : 'owner');

// Actions offered per status.
const NEXT_ACTIONS: Record<string, { action: BoardingAction; label: string; primary?: boolean }[]> = {
  PENDING: [{ action: 'confirm', label: 'Confirm', primary: true }, { action: 'cancel', label: 'Cancel' }],
  CONFIRMED: [{ action: 'check_in', label: 'Check in', primary: true }, { action: 'cancel', label: 'Cancel' }],
  CHECKED_IN: [{ action: 'complete', label: 'Complete', primary: true }],
};

export const BoardingScreen: React.FC = () => {
  const qc = useQueryClient();
  const { addFlash } = useFlash();
  // Deep links (e.g. the dashboard "ending soon" alert) can point straight at a
  // tab and a specific stay: ?tab=CHECKED_IN&ref=BRD-XXXX opens that tab and
  // scrolls the card into view, instead of dropping the doctor on Pending where
  // a checked-in stay is not even listed.
  const [searchParams] = useSearchParams();
  const highlightRef = searchParams.get('ref') || '';
  const [tab, setTab] = useState<StatusTab>(() => {
    const t = searchParams.get('tab') as StatusTab | null;
    return t && TABS.some((x) => x.key === t) ? t : 'PENDING';
  });
  const [showNew, setShowNew] = useState(false);

  const statusParam = tab === 'ALL' ? undefined : tab;
  const { data, isLoading, isError } = useQuery({
    queryKey: boardingQueryKey(statusParam),
    queryFn: () => fetchBoardings(statusParam),
  });

  const action = useMutation({
    mutationFn: ({ reference, act, intake }: { reference: string; act: BoardingAction; intake?: Record<string, string> }) =>
      updateBoardingStatus(reference, act, intake),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['boarding'] });
      addFlash(vars.act === 'cancel' ? 'Booking cancelled — beds freed.' : 'Booking updated.', 'success');
    },
    onError: () => addFlash('Could not update the booking.', 'error'),
  });

  const rows: Boarding[] = data?.results ?? [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">Boarding</h1>
          <p className="page-sub">Indoor-facility stays — 24×7, six beds, priced by duration. Paid at the clinic.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew((s) => !s)}>
          <Icon name={showNew ? 'close' : 'plus'} size={14} /> {showNew ? 'Close' : 'New boarding'}
        </button>
      </div>

      {showNew && <NewBoardingForm onDone={() => { setShowNew(false); qc.invalidateQueries({ queryKey: ['boarding'] }); }} />}

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: '8px', margin: '18px 0 20px', borderBottom: '2px solid var(--glass-border)', paddingBottom: '12px', overflowX: 'auto' }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`btn ${tab === t.key ? 'btn-primary' : 'btn-ghost'}`}>
            {t.label}{t.key === 'PENDING' && data?.pending_count ? ` (${data.pending_count})` : ''}
          </button>
        ))}
      </div>

      {isLoading && <p className="page-sub">Loading…</p>}
      {isError && <div className="alert alert-danger">Could not load bookings. Please refresh.</div>}
      {!isLoading && !isError && rows.length === 0 && (
        <div className="glass-card" style={{ textAlign: 'center', padding: '40px' }}>
          <Icon name="clock" size={28} />
          <p className="page-sub" style={{ marginTop: '10px' }}>Nothing here yet.</p>
        </div>
      )}

      <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 480px))' }}>
        {rows.map((g) => (
          <BoardingCard
            key={g.reference}
            g={g}
            highlight={!!highlightRef && g.reference === highlightRef}
            busy={action.isPending && action.variables?.reference === g.reference}
            onAction={(act, intake) => action.mutate({ reference: g.reference, act, intake })}
          />
        ))}
      </div>
    </div>
  );
};

/* ---- One booking card, with the clinic-only intake editor ---- */

const INTAKE_FIELDS: { key: 'food_by' | 'utensils_by' | 'medicines_by' | 'blanket_by'; label: string }[] = [
  { key: 'food_by', label: 'Food' },
  { key: 'utensils_by', label: 'Utensils' },
  { key: 'medicines_by', label: 'Medicines' },
  { key: 'blanket_by', label: 'Blanket' },
];

const BoardingCard: React.FC<{
  g: Boarding;
  busy: boolean;
  highlight?: boolean;
  onAction: (act: BoardingAction, intake?: Record<string, string>) => void;
}> = ({ g, busy, highlight, onAction }) => {
  const actions = NEXT_ACTIONS[g.status] ?? [];
  const editable = actions.length > 0;
  const [intake, setIntake] = useState<Record<string, string>>({
    food_by: g.food_by, utensils_by: g.utensils_by, medicines_by: g.medicines_by,
    blanket_by: g.blanket_by, food_preference: g.food_preference || '',
  });
  // Intake reads as a compact line by default; the editor opens on demand so a
  // wall of dropdowns is not the first thing on every card.
  const [editing, setEditing] = useState(false);

  // When deep-linked to (?ref=…), bring this card into view so the doctor lands
  // on the exact stay rather than the top of the list.
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlight && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlight]);

  return (
    <div
      ref={cardRef}
      className="glass-card"
      style={{
        padding: '18px',
        borderLeft: `4px solid ${highlight ? '#c62828' : 'var(--primary)'}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        boxShadow: highlight ? '0 0 0 2px #c62828' : undefined,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '1.05rem' }}>{g.pet_name}</strong>
            <span className={`badge ${BADGE_CLASS[g.status] ?? 'badge-pending'}`}>{g.status.replace('_', ' ')}</span>
            {g.source === 'doctor' && <span className="page-sub" style={{ fontSize: '0.7rem' }}>· clinic-entered</span>}
          </div>
          <p className="page-sub" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
            {g.owner_name}<br /><a href={`tel:${g.owner_phone}`}>{g.owner_phone}</a>
          </p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontWeight: 700 }}>{g.duration_label}</div>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--primary)' }}>{formatMoney(g.price)}</div>
          <div className="page-sub" style={{ fontSize: '0.72rem', marginTop: '2px' }}>{g.reference}</div>
        </div>
      </div>

      <div className="page-sub" style={{ fontSize: '0.85rem', margin: 0 }}>
        <Icon name="clock" size={12} /> {friendlyDate(g.check_in)}
        {g.check_out !== g.check_in ? ` → ${friendlyDate(g.check_out)}` : ''}
      </div>

      {/* Intake — the clinic records this here (owner vs clinic per item), it is
          not asked on the public form. Editable while the stay is live; saved
          with the next action (confirm / check-in). */}
      {editable && editing ? (
        <div style={{ display: 'grid', gap: '6px', background: 'var(--surface-2, rgba(0,0,0,0.02))', padding: '10px', borderRadius: '10px' }}>
          {INTAKE_FIELDS.map((it) => (
            <label key={it.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '0.82rem' }}>
              {it.label}
              <select
                className="input"
                style={{ width: 'auto', padding: '2px 6px' }}
                value={intake[it.key]}
                onChange={(e) => setIntake((p) => ({ ...p, [it.key]: e.target.value }))}
              >
                <option value="owner">owner brings</option>
                <option value="clinic">clinic provides</option>
              </select>
            </label>
          ))}
          <input
            className="input"
            style={{ fontSize: '0.82rem' }}
            placeholder="Food note (brand / diet)"
            value={intake.food_preference}
            onChange={(e) => setIntake((p) => ({ ...p, food_preference: e.target.value }))}
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ justifySelf: 'start' }}
            onClick={() => setEditing(false)}
          >
            <Icon name="check" size={12} /> Done
          </button>
        </div>
      ) : (
        <div style={{ fontSize: '0.82rem', lineHeight: 1.6 }}>
          <div>
            <b>Bringing:</b> food {providerLabel(intake.food_by)}, utensils {providerLabel(intake.utensils_by)},
            medicines {providerLabel(intake.medicines_by)}, blanket {providerLabel(intake.blanket_by)}
          </div>
          {intake.food_preference && <div><b>Food:</b> {intake.food_preference}</div>}
          {editable && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginTop: '6px' }}
              onClick={() => setEditing(true)}
            >
              <Icon name="edit" size={12} /> Edit what&rsquo;s brought
            </button>
          )}
        </div>
      )}

      <div style={{ fontSize: '0.82rem', lineHeight: 1.6 }}>
        {g.walk_times?.length > 0 && <div><b>Walks:</b> {g.walk_times.join(', ')}</div>}
        {g.aadhaar && <div><b>Aadhaar:</b> {g.aadhaar}</div>}
      </div>

      {actions.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--glass-border)' }}>
          {actions.map((a) => (
            <button
              key={a.action}
              type="button"
              className={`btn btn-sm ${a.primary ? 'btn-primary' : 'btn-ghost'}`}
              disabled={busy}
              onClick={() => onAction(a.action, a.action === 'cancel' ? undefined : intake)}
            >
              {a.primary && <Icon name="check" size={14} />} {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/* ---- Doctor's own "new boarding" form ---- */

const WALKS = [
  { key: 'morning', label: 'Morning' },
  { key: 'evening', label: 'Evening' },
  { key: 'late', label: 'Late' },
];
const ITEMS: { field: string; label: string }[] = [
  { field: 'foodBy', label: 'Food' },
  { field: 'utensilsBy', label: 'Utensils' },
  { field: 'medicinesBy', label: 'Medicines' },
  { field: 'blanketBy', label: 'Blanket' },
];

const NewBoardingForm: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const { addFlash } = useFlash();
  const { data: menu } = useQuery({ queryKey: ['boarding-menu'], queryFn: () => fetchBoardingMenu() });
  const today = todayISO();
  const [f, setF] = useState<Record<string, string>>({
    petName: '', ownerName: '', ownerPhone: '', checkIn: today, duration: '',
    foodBy: 'owner', utensilsBy: 'owner', medicinesBy: 'owner', blanketBy: 'owner',
    foodPreference: '', aadhaar: '',
  });
  const [walks, setWalks] = useState<string[]>([]);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const create = useMutation({
    mutationFn: () =>
      createBoarding({
        petName: f.petName, ownerName: f.ownerName, ownerPhone: f.ownerPhone,
        checkIn: f.checkIn, duration: f.duration,
        foodBy: f.foodBy, utensilsBy: f.utensilsBy, medicinesBy: f.medicinesBy, blanketBy: f.blanketBy,
        foodPreference: f.foodPreference || undefined,
        walkTimes: walks,
        aadhaar: f.aadhaar.replace(/\s/g, '') || undefined,
        termsAccepted: true,
      }),
    onSuccess: (r) => { addFlash(`Boarding created (${r.reference}).`, 'success'); onDone(); },
    onError: (e: any) => addFlash(e?.detail || 'Could not create the booking.', 'error'),
  });

  const aadhaarOk = !f.aadhaar || isValidAadhaar(f.aadhaar);
  const canSave = f.petName.trim() && f.ownerName.trim() && f.ownerPhone.trim() && f.duration && aadhaarOk && !create.isPending;

  return (
    <div className="glass-card" style={{ padding: '18px', marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <strong>New boarding</strong>
      <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <input className="input" placeholder="Pet's name *" value={f.petName} onChange={(e) => set('petName', e.target.value)} />
        <input className="input" placeholder="Owner name *" value={f.ownerName} onChange={(e) => set('ownerName', e.target.value)} />
        <input className="input" placeholder="Phone *" value={f.ownerPhone} onChange={(e) => set('ownerPhone', e.target.value)} />
        <input className="input" type="date" value={f.checkIn} min={today} onChange={(e) => set('checkIn', e.target.value)} />
        <select className="input" value={f.duration} onChange={(e) => set('duration', e.target.value)}>
          <option value="">Duration *</option>
          {(menu?.durations ?? []).map((d) => <option key={d.key} value={d.key}>{d.label} — {formatMoney(d.price)}</option>)}
        </select>
        <input className="input" placeholder="Aadhaar (12 digits)" inputMode="numeric" value={f.aadhaar} onChange={(e) => set('aadhaar', e.target.value)} />
      </div>

      <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {ITEMS.map((it) => (
          <label key={it.field} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '0.85rem' }}>
            {it.label}
            <select className="input" style={{ width: 'auto' }} value={f[it.field]} onChange={(e) => set(it.field, e.target.value)}>
              <option value="owner">owner brings</option>
              <option value="clinic">clinic provides</option>
            </select>
          </label>
        ))}
      </div>

      <input className="input" placeholder="Food preference (optional)" value={f.foodPreference} onChange={(e) => set('foodPreference', e.target.value)} />

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {WALKS.map((w) => {
          const on = walks.includes(w.key);
          return (
            <button key={w.key} type="button" className={`btn btn-sm ${on ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setWalks((p) => (on ? p.filter((k) => k !== w.key) : [...p, w.key]))}>
              {w.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="btn btn-primary" disabled={!canSave} onClick={() => create.mutate()}>
          {create.isPending ? 'Saving…' : 'Create & confirm'}
        </button>
        <button className="btn btn-ghost" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
};
