import React from 'react';
import { CalendarCheck, Check, Loader2, Clock, AlertCircle } from 'lucide-react';

/**
 * One-hour slot booking — a two-step, BookMyShow-style flow (minus payment).
 * Used by Physiotherapy only — the one service that reserves a real one-hour
 * clinic slot. Swimming, Grooming and Walking are slot-less requests (see
 * ServiceRequestBooking) and the Indoor Facility is a boarding stay.
 *
 * Step 1 (select): the visitor sees live availability — each one-hour slot,
 * 09:30–13:30, holds up to a fixed number of bookings (currently 3) and shows
 * how many are left right now — picks a date, chooses up to three slots, and
 * HOLDS them. The capacity and the three-slot cap come from the API, never
 * hard-coded here.
 *
 * Step 2 (confirm): the held slots are locked for the visitor for a few minutes
 * with a visible countdown, exactly like a cinema seat. They fill in their
 * details and confirm before the timer runs out. If it lapses, the slots return
 * to the pool and they start again. The chosen service is recorded on the hold.
 *
 * A confirmed hold becomes a PENDING request the clinic still confirms by phone
 * — this is a reservation, not a paid ticket, and the copy says so.
 */

import { CLINIC_API, isoDate } from '../lib/clinicApi';

interface Slot {
  slot: number;
  start: string;
  end: string;
  label: string;
  capacity: number;
  available: number;
}

interface Availability {
  date: string;
  capacity: number;
  max_slots_per_booking: number;
  slots: Slot[];
}

interface Hold {
  reference: string;
  date: string;
  slots: { slot: number; label: string }[];
  expiresAt: number; // epoch ms
}

interface Props {
  /** Close the whole booking panel (the visitor is done). */
  onClose: () => void;
  /** The service being booked — recorded on the reservation so the clinic
      knows what the slot is for. */
  serviceLabel?: string;
}

/** YYYY-MM-DD for a date `offsetDays` from today, in the visitor's own zone. */

import { field, labelCls, primaryBtn } from '../lib/formStyles';

export const FacilitySlotBooking: React.FC<Props> = ({ onClose, serviceLabel }) => {
  type Phase = 'select' | 'confirm' | 'done';
  const [phase, setPhase] = React.useState<Phase>('select');

  const minDate = React.useMemo(() => isoDate(0), []);
  const maxDate = React.useMemo(() => isoDate(90), []);
  const [date, setDate] = React.useState(minDate);
  const [avail, setAvail] = React.useState<Availability | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [chosen, setChosen] = React.useState<number[]>([]);

  const [hold, setHold] = React.useState<Hold | null>(null);
  const [secondsLeft, setSecondsLeft] = React.useState(0);
  const [form, setForm] = React.useState({ petName: '', ownerName: '', ownerPhone: '', note: '' });
  const [website, setWebsite] = React.useState(''); // honeypot
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [booked, setBooked] = React.useState<{ reference: string; detail: string } | null>(null);

  const maxSlots = avail?.max_slots_per_booking ?? 3;

  // ---- Step 1: availability -------------------------------------------------
  const loadAvailability = React.useCallback((forDate: string) => {
    setLoading(true);
    return fetch(`${CLINIC_API}/facility/availability?date=${forDate}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Availability) => setAvail(d))
      .catch(() => setAvail(null))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    if (phase !== 'select') return;
    setChosen([]);
    setError('');
    let cancelled = false;
    setLoading(true);
    fetch(`${CLINIC_API}/facility/availability?date=${date}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Availability) => !cancelled && setAvail(d))
      .catch(() => !cancelled && setAvail(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date, phase]);

  // ---- The countdown --------------------------------------------------------
  React.useEffect(() => {
    if (phase !== 'confirm' || !hold) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.round((hold.expiresAt - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [phase, hold]);

  const expired = phase === 'confirm' && secondsLeft <= 0;
  const mmss = `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(
    secondsLeft % 60,
  ).padStart(2, '0')}`;

  const toggleSlot = (slot: number, available: number) => {
    if (available <= 0) return;
    setChosen((prev) => {
      if (prev.includes(slot)) return prev.filter((s) => s !== slot);
      // One slot per booking: picking another simply replaces the choice.
      if (maxSlots === 1) return [slot];
      if (prev.length >= maxSlots) return prev;
      return [...prev, slot].sort((a, b) => a - b);
    });
  };

  // ---- Step 1 → hold --------------------------------------------------------
  const placeHold = async () => {
    if (chosen.length === 0 || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${CLINIC_API}/facility/holds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, slots: chosen, website }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Those slots could not be held. Please try another time.');
        if (res.status === 409) {
          loadAvailability(date);
          setChosen([]);
        }
        return;
      }
      setHold({
        reference: data.reference,
        date: data.date,
        slots: data.slots,
        expiresAt: Date.now() + data.hold_seconds * 1000,
      });
      setPhase('confirm');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // ---- Step 2 → confirm -----------------------------------------------------
  const canConfirm =
    !expired && form.petName.trim() && form.ownerName.trim() && form.ownerPhone.trim() && !busy;

  const confirmHold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hold || !canConfirm) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${CLINIC_API}/facility/holds/${hold.reference}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Record the service and chosen package in the note the clinic reads.
        body: JSON.stringify({
          ...form,
          note: [serviceLabel, form.note].filter(Boolean).join(' — '),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 410 = the hold lapsed server-side between the timer and the request.
        setError(data.detail || 'That could not be confirmed. Please try again.');
        if (res.status === 410) setSecondsLeft(0);
        return;
      }
      setBooked({ reference: data.reference, detail: data.detail });
      setPhase('done');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const startOver = () => {
    setHold(null);
    setForm({ petName: '', ownerName: '', ownerPhone: '', note: '' });
    setError('');
    setPhase('select');
  };

  // ---- Done -----------------------------------------------------------------
  if (phase === 'done' && booked) {
    return (
      <div className="pt-2 text-center">
        <div className="w-14 h-14 rounded-full bg-(--c-ink) text-white flex items-center justify-center mx-auto mb-5">
          <Check className="w-7 h-7" />
        </div>
        <h4 className="font-(family-name:--f-display) text-2xl text-(--c-ink) font-light mb-3">
          Slots held
        </h4>
        <p className="font-(family-name:--f-body) text-sm text-(--c-body) leading-relaxed mb-5">{booked.detail}</p>
        <p className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-6">
          Reference {booked.reference}
        </p>
        <button type="button" onClick={onClose} className={primaryBtn}>
          Done
        </button>
      </div>
    );
  }

  // ---- Step 2: confirm within the countdown ---------------------------------
  if (phase === 'confirm' && hold) {
    return (
      <form onSubmit={confirmHold} className="pt-2">
        {/* Countdown banner — the "seats blocked for 09:59" moment. */}
        <div
          className={`flex items-center justify-between px-4 py-3 mb-6 border ${
            expired ? 'border-[#b23b3b]/40 bg-[#f7ecec]' : 'border-(--c-accent)/30 bg-(--c-surface)'
          }`}
        >
          <span className="flex items-center gap-2 text-sm text-(--c-ink)">
            {expired ? (
              <AlertCircle className="w-4 h-4 text-[#b23b3b]" />
            ) : (
              <Clock className="w-4 h-4 text-(--c-accent)" />
            )}
            {expired ? 'Your hold has expired' : 'Slots held for you'}
          </span>
          {!expired && (
            <span className="font-mono text-lg font-semibold text-(--c-accent) tabular-nums">{mmss}</span>
          )}
        </div>

        <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-1">
          {hold.slots.map((s) => s.label).join('  ·  ')}
        </p>
        <p className="text-xs text-(--c-body) mb-6">
          {new Date(hold.date).toLocaleDateString(undefined, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>

        {expired ? (
          <button type="button" onClick={startOver} className={primaryBtn}>
            Choose slots again
          </button>
        ) : (
          <>
            <div className="space-y-5">
              <div>
                <label className={labelCls} htmlFor="fac-pet">
                  Pet&rsquo;s name *
                </label>
                <input
                  id="fac-pet"
                  className={field}
                  placeholder="e.g. Bruno"
                  value={form.petName}
                  onChange={(e) => setForm({ ...form, petName: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className={labelCls} htmlFor="fac-owner">
                    Your name *
                  </label>
                  <input
                    id="fac-owner"
                    className={field}
                    placeholder="e.g. Priya"
                    value={form.ownerName}
                    onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="fac-phone">
                    Phone *
                  </label>
                  <input
                    id="fac-phone"
                    className={field}
                    placeholder="e.g. 98765 43210"
                    value={form.ownerPhone}
                    onChange={(e) => setForm({ ...form, ownerPhone: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="fac-note">
                  Anything we should know?
                </label>
                <input
                  id="fac-note"
                  className={field}
                  placeholder="Optional"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </div>
            </div>

            {error && <p className="text-sm text-[#b23b3b] mt-4">{error}</p>}

            <button type="submit" disabled={!canConfirm} className={`${primaryBtn} mt-6`}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirm booking
            </button>
            <button
              type="button"
              onClick={startOver}
              className="w-full mt-3 text-xs uppercase tracking-widest text-(--c-accent) hover:text-(--c-ink) transition-colors"
            >
              Back
            </button>
          </>
        )}
      </form>
    );
  }

  // ---- Step 1: select the date and slots ------------------------------------
  return (
    <div className="pt-2">
      <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-5">
        <CalendarCheck className="w-4 h-4" />
        Choose a day and time
      </p>

      <label className={labelCls} htmlFor="fac-date">
        Date
      </label>
      <input
        id="fac-date"
        type="date"
        value={date}
        min={minDate}
        max={maxDate}
        onChange={(e) => setDate(e.target.value || minDate)}
        className={`${field} mb-6`}
      />

      <span className={labelCls}>
        Time slot{' '}
        <span className="text-(--c-accent) normal-case tracking-normal font-normal">
          {maxSlots === 1 ? '— pick one' : `— pick up to ${maxSlots}`}
        </span>
      </span>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-(--c-body) py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Checking availability…
        </div>
      ) : !avail ? (
        <p className="text-sm text-(--c-accent) py-4">
          Could not load availability. Please call the clinic to book.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 mb-6">
          {avail.slots.map((s) => {
            const isChosen = chosen.includes(s.slot);
            const full = s.available <= 0;
            const blocked = !isChosen && chosen.length >= maxSlots;
            return (
              <button
                key={s.slot}
                type="button"
                disabled={full}
                aria-pressed={isChosen}
                onClick={() => toggleSlot(s.slot, s.available)}
                className={`relative text-left p-3 border transition-colors ${
                  full
                    ? 'border-(--c-line)/40 bg-(--c-surface-2) text-(--c-mute-2) cursor-not-allowed'
                    : isChosen
                      ? 'border-(--c-ink) bg-(--c-ink) text-white'
                      : blocked
                        ? 'border-(--c-line)/40 text-(--c-mute-2)'
                        : 'border-(--c-line) text-(--c-ink) hover:border-(--c-accent)'
                }`}
              >
                {isChosen && <Check className="absolute top-2 right-2 w-4 h-4" />}
                <span className="block font-medium text-sm">{s.label}</span>
                <span className={`block text-xs mt-1 ${isChosen ? 'text-white/80' : 'text-(--c-accent)'}`}>
                  {full ? 'Full' : `${s.available} of ${s.capacity} left`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Honeypot */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="absolute left-[-9999px] w-px h-px opacity-0"
      />

      {error && <p className="text-sm text-[#b23b3b] mb-4">{error}</p>}

      <button
        type="button"
        onClick={placeHold}
        disabled={chosen.length === 0 || busy}
        className={primaryBtn}
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        {chosen.length > 0
          ? `Hold ${chosen.length} slot${chosen.length > 1 ? 's' : ''}`
          : 'Choose a slot'}
      </button>
      <p className="text-xs text-(--c-accent) mt-3 leading-relaxed">
        Your slots are held for a few minutes while you enter your details, then the clinic confirms
        by phone.
      </p>
    </div>
  );
};
