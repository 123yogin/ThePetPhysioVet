import React from 'react';
import { AlertCircle, CalendarCheck, Check, Clock, Loader2, ShieldCheck } from 'lucide-react';
import { isValidAadhaar } from '../lib/aadhaar';

/**
 * Indoor Facility (boarding) booking — a duration-priced stay, distinct from the
 * hourly slot picker every other service uses. The visitor picks how long the
 * stay is (shown with its price), a check-in date, says who brings food /
 * utensils / medicines / blanket, which walks they want, gives an Aadhaar
 * number and accepts the terms. Six beds; a date that is full is refused.
 * Payment is at the clinic — this is a request the clinic confirms.
 *
 * All prices, durations, walk options and capacity come from
 * GET /facility/boarding/availability; nothing is hard-coded here.
 */

import { CLINIC_API, getJson, isoDate } from '../lib/clinicApi';

interface Duration { key: string; label: string; days: number; price: number }
interface WalkOption { key: string; label: string; minutes: number }
interface Menu { capacity: number; durations: Duration[]; walk_options: WalkOption[] }
interface Selection {
  check_in: string; duration: string; duration_label: string;
  check_out: string; price: number; available: number;
}

/** A bed held for this visitor for the chosen dates; `expiresAt` is epoch ms. */
interface Hold { reference: string; expiresAt: number; date: string; duration: string }

/** Digits only, folding a leading +91 / 91 / 0, so spacing and country code can't hide a duplicate. */
function phoneKey(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.length === 14 && d.startsWith('0091')) d = d.slice(4);
  if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
  if (d.length > 10 && d.startsWith('0')) d = d.slice(1);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}
const pad2 = (n: number) => String(n).padStart(2, '0');

interface Props {
  onClose: () => void;
}


import { field, labelCls, primaryBtn } from '../lib/formStyles';
import { rupee, boardingHomeDate, shortDate } from '../lib/format';
import { friendlyApiError, isPlausiblePhone, PHONE_HINT } from '../lib/errors';

export const IndoorFacilityBooking: React.FC<Props> = ({ onClose }) => {
  const [menu, setMenu] = React.useState<Menu | null>(null);
  const minDate = React.useMemo(() => isoDate(0), []);
  const maxDate = React.useMemo(() => isoDate(90), []);

  const [duration, setDuration] = React.useState('');
  const [date, setDate] = React.useState(minDate);
  const [selection, setSelection] = React.useState<Selection | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [availTick, setAvailTick] = React.useState(0); // bump to re-fetch availability

  const [form, setForm] = React.useState({
    petName: '', ownerName: '', ownerPhone: '', ownerEmail: '', aadhaar: '',
    emergencyName: '', emergencyPhone: '',
  });
  const [walkTimes, setWalkTimes] = React.useState<string[]>([]);
  const [terms, setTerms] = React.useState(false);
  const [website, setWebsite] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [hold, setHold] = React.useState<Hold | null>(null);
  const [holding, setHolding] = React.useState(false);
  const [holdNote, setHoldNote] = React.useState('');
  const [secondsLeft, setSecondsLeft] = React.useState(0);
  const [booked, setBooked] = React.useState<{ reference: string; detail: string } | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Load the duration/walk/price menu once.
  React.useEffect(() => {
    let cancelled = false;
    getJson('/facility/boarding/availability')
      .then((d: Menu) => !cancelled && setMenu(d))
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Re-check beds/price whenever a duration + date is chosen.
  React.useEffect(() => {
    if (!duration || !date) { setSelection(null); return; }
    let cancelled = false;
    setChecking(true);
    getJson(`/facility/boarding/availability?check_in=${date}&duration=${duration}`)
      .then((d) => !cancelled && setSelection(d.selection ?? null))
      .catch(() => !cancelled && setSelection(null))
      .finally(() => !cancelled && setChecking(false));
    return () => { cancelled = true; };
  }, [duration, date, availTick]);

  // A note about a previous hold attempt is stale once the dates change.
  React.useEffect(() => { setHoldNote(''); }, [date, duration]);

  // A hold only applies to the exact dates it was placed for. Changing the date or
  // duration simply stops matching; the old hold lapses server-side on its own.
  const activeHold = hold && hold.date === date && hold.duration === duration ? hold : null;

  // The countdown (same approach as FacilitySlotBooking).
  React.useEffect(() => {
    if (!activeHold) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.round((activeHold.expiresAt - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [activeHold]);

  const expired = !!activeHold && secondsLeft <= 0;
  const holdLive = !!activeHold && !expired;
  // One announcement per state change: text only changes at these thresholds.
  const holdStatus = expired ? 'Your hold expired. Please hold again.'
    : holdLive ? (secondsLeft <= 60 ? 'One minute left on your bed hold.' : 'Bed held for 10 minutes.')
      : '';
  const mmss = `${pad2(Math.floor(secondsLeft / 60))}:${pad2(secondsLeft % 60)}`;

  const placeHold = async () => {
    if (!duration || !date || holding) return;
    setHolding(true);
    setHoldNote('');
    setError('');
    try {
      const res = await fetch(`${CLINIC_API}/facility/boarding/holds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ check_in: date, duration }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setHold(null);
        setHoldNote('Just taken — pick another date.');
        setAvailTick((n) => n + 1);
        return;
      }
      const expiresAt = Date.parse(data.expires_at);
      if (!res.ok || !data.reference || !Number.isFinite(expiresAt)) {
        setHoldNote(friendlyApiError(data.detail, 'We could not hold a bed. Please try again.'));
        return;
      }
      // Seed the countdown now so there is no one-frame "expired" flash.
      setSecondsLeft(Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));
      setHold({ reference: data.reference, expiresAt, date, duration });
    } catch {
      setHoldNote('Something went wrong. Please try again.');
    } finally {
      setHolding(false);
    }
  };

  const toggleWalk = (key: string) =>
    setWalkTimes((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const aadhaarOk = isValidAadhaar(form.aadhaar);
  const full = !!selection && selection.available <= 0;
  const samePhone =
    !!form.emergencyPhone.trim() && phoneKey(form.emergencyPhone) === phoneKey(form.ownerPhone);
  const aadhaarMsg = 'Please enter a valid 12-digit Aadhaar number.';
  // Why the request can't go yet, in the order the visitor should fix things.
  // The button is never silently disabled: this text is shown next to it.
  const blocker =
    !duration || !date ? 'Choose a stay length and check-in date.'
      : full ? 'Fully booked for those dates — try another date or duration.'
      : !holdLive ? 'Hold a bed first.'
      : !form.petName.trim() || !form.ownerName.trim() || !form.ownerPhone.trim() ? 'Please fill in the required fields.'
      : !isPlausiblePhone(form.ownerPhone) ? PHONE_HINT
      : !form.emergencyPhone.trim() ? 'Please add an emergency contact number.'
      : !isPlausiblePhone(form.emergencyPhone) ? `Emergency contact: ${PHONE_HINT.charAt(0).toLowerCase()}${PHONE_HINT.slice(1)}`
      : samePhone ? 'Emergency contact must be a different number.'
      : !aadhaarOk ? aadhaarMsg
      : !terms ? 'Please accept the terms and conditions.'
      : '';
  // A stale submit error goes away as soon as what blocked it changes.
  React.useEffect(() => { setError(''); }, [blocker]);
  const aadhaarShowError = !!form.aadhaar.trim() && !aadhaarOk;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (blocker) {
      setError(blocker);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${CLINIC_API}/facility/boarding/holds/${activeHold!.reference}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          petName: form.petName, ownerName: form.ownerName, ownerPhone: form.ownerPhone,
          ownerEmail: form.ownerEmail || undefined,
          checkIn: date, duration,
          emergencyContactName: form.emergencyName.trim() || undefined,
          emergencyContactPhone: form.emergencyPhone,
          walkTimes,
          aadhaar: form.aadhaar.replace(/\s/g, ''),
          termsAccepted: terms,
          website,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 410) {
        setHold(null);
        setHoldNote('Your hold expired — hold again.');
        return;
      }
      if (res.status === 404) {
        setHold(null);
        setHoldNote('That hold is no longer available — hold again.');
        return;
      }
      if (!res.ok) {
        setError(friendlyApiError(data.detail, 'We could not book that stay. Please try again.'));
        return;
      }
      setBooked({ reference: data.reference, detail: data.detail });
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (booked) {
    return (
      <div className="pt-2 text-center">
        <div className="w-14 h-14 rounded-full bg-(--c-ink) text-white flex items-center justify-center mx-auto mb-5">
          <Check className="w-7 h-7" />
        </div>
        <h4 className="font-(family-name:--f-display) text-2xl text-(--c-ink) font-light mb-3">Stay requested</h4>
        <p className="font-(family-name:--f-body) text-sm text-(--c-body) leading-relaxed mb-5">{booked.detail}</p>
        <p className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-6">
          Reference {booked.reference} · Pay at the clinic
        </p>
        <button type="button" onClick={onClose} className={primaryBtn}>Done</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="pt-2">
      <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-5">
        <CalendarCheck className="w-4 h-4" />
        Choose a stay
      </p>

      {/* Duration + price. Multi-day stays show their saving against booking
          the 24-hour stay day after day (the 24-hour price x days). Hourly
          stays under a day are a different product, so they get no badge. */}
      <span className={labelCls}>Duration</span>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {(menu?.durations ?? []).map((d) => {
          const on = duration === d.key;
          const dayRate = menu?.durations.find((x) => x.key === '24h')?.price;
          const fullPrice = dayRate && d.days > 1 ? dayRate * d.days : null;
          const savePct =
            fullPrice && d.price < fullPrice ? Math.round(((fullPrice - d.price) / fullPrice) * 100) : null;
          return (
            <button
              key={d.key}
              type="button"
              aria-pressed={on}
              onClick={() => setDuration(d.key)}
              className={`text-left p-3 border transition-colors ${
                on ? 'border-(--c-ink) bg-(--c-ink) text-white' : 'border-(--c-line) text-(--c-ink) hover:border-(--c-accent)'
              }`}
            >
              <span className="block font-medium text-sm">{d.label}</span>
              <span className={`block text-xs mt-1 ${on ? 'text-white/80' : 'text-(--c-accent)'}`}>{rupee(d.price)}</span>
              {savePct !== null && (
                <span
                  className={`inline-flex w-fit items-center rounded-full border px-1.5 py-0.5 mt-1.5 text-[10px] font-semibold uppercase tracking-wide ${
                    on ? 'border-white text-white' : 'border-(--c-accent) text-(--c-accent)'
                  }`}
                >
                  Save {savePct}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Check-in date */}
      <label className={labelCls} htmlFor="brd-date">Check-in date</label>
      <input
        id="brd-date"
        type="date"
        value={date}
        min={minDate}
        max={maxDate}
        onChange={(e) => setDate(e.target.value || minDate)}
        className={`${field} mb-2`}
      />
      <p className="text-xs text-(--c-accent) mb-6 min-h-[18px]">
        {checking ? 'Checking availability…'
          : selection
            ? full
              ? 'Fully booked for those dates — try another date or duration.'
              : `${selection.available} of ${menu?.capacity ?? 6} beds free · ${(() => {
                  // check_out is the last night; say the day the pet goes home (D4).
                  const home = boardingHomeDate(selection.check_in, selection.check_out, selection.duration);
                  return home === selection.check_in ? 'home the same day' : `home ${shortDate(home)}`;
                })()} · ${rupee(selection.price)}`
            : 'Pick a duration to see availability.'}
      </p>

      {/* Bed hold */}
      <div className="mb-6">
        <p className="sr-only" role="status" aria-live="polite">{holdStatus}</p>
        {holdLive ? (
          <div className="flex items-center justify-between px-4 py-3 border border-(--c-accent)/30 bg-(--c-surface)">
            <span className="flex items-center gap-2 text-sm text-(--c-ink)">
              <Clock className="w-4 h-4 text-(--c-accent)" /> Bed held for you
            </span>
            <span role="timer" aria-live="off" className="font-mono text-lg font-semibold text-(--c-accent) tabular-nums">{mmss}</span>
          </div>
        ) : (
          <>
            {(expired || holdNote) && (
              <p className="flex items-center gap-2 text-sm text-[#b23b3b] mb-3" role="alert">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {expired ? 'Your hold expired — hold again.' : holdNote}
              </p>
            )}
            {selection && !full && (
              <button type="button" onClick={placeHold} disabled={holding || checking} className={primaryBtn}>
                {holding && <Loader2 className="w-4 h-4 animate-spin" />}
                Hold this bed
              </button>
            )}
          </>
        )}
      </div>

      {/* Walks */}
      <span className={labelCls}>Walks</span>
      <div className="flex flex-wrap gap-2 mb-6">
        {(menu?.walk_options ?? []).map((w) => {
          const on = walkTimes.includes(w.key);
          return (
            <button
              key={w.key}
              type="button"
              aria-pressed={on}
              onClick={() => toggleWalk(w.key)}
              className={`px-3.5 py-1.5 text-sm border transition-colors ${
                on ? 'border-(--c-ink) bg-(--c-ink) text-white' : 'border-(--c-line) text-(--c-body) hover:border-(--c-accent)'
              }`}
            >
              {w.label} · {w.minutes} min
            </button>
          );
        })}
      </div>

      {/* Details */}
      <div className="space-y-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className={labelCls} htmlFor="brd-pet">Pet's name *</label>
            <input id="brd-pet" className={field} value={form.petName} onChange={(e) => set('petName', e.target.value)} placeholder="e.g. Bruno" />
          </div>
          <div>
            <label className={labelCls} htmlFor="brd-owner">Your name *</label>
            <input id="brd-owner" className={field} value={form.ownerName} onChange={(e) => set('ownerName', e.target.value)} placeholder="e.g. Priya" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className={labelCls} htmlFor="brd-phone">Phone *</label>
            <input id="brd-phone" type="tel" inputMode="tel" autoComplete="tel" className={field} value={form.ownerPhone} onChange={(e) => set('ownerPhone', e.target.value)} placeholder="e.g. 98765 43210" />
          </div>
          <div>
            <label className={labelCls} htmlFor="brd-email">Email</label>
            <input id="brd-email" className={field} value={form.ownerEmail} onChange={(e) => set('ownerEmail', e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className={labelCls} htmlFor="brd-em-name">Emergency contact name</label>
            <input id="brd-em-name" className={field} value={form.emergencyName} onChange={(e) => set('emergencyName', e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <label className={labelCls} htmlFor="brd-em-phone">Emergency contact phone *</label>
            <input
              id="brd-em-phone" type="tel" className={field} value={form.emergencyPhone}
              onChange={(e) => set('emergencyPhone', e.target.value)}
              placeholder="A different number from yours"
              aria-invalid={samePhone || undefined}
              aria-describedby={samePhone ? 'brd-em-err' : undefined}
            />
            {samePhone && (
              <p id="brd-em-err" className="text-xs text-[#b23b3b] mt-1">Emergency contact must be a different number.</p>
            )}
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="brd-aadhaar">Aadhaar number * <span className="normal-case tracking-normal text-(--c-accent)">(required at check-in)</span></label>
          <input
            id="brd-aadhaar"
            inputMode="numeric"
            className={field}
            value={form.aadhaar}
            onChange={(e) => set('aadhaar', e.target.value)}
            placeholder="12-digit Aadhaar"
            aria-invalid={aadhaarShowError || undefined}
            aria-describedby={aadhaarShowError ? 'brd-aadhaar-err' : undefined}
          />
          {aadhaarShowError && (
            <p id="brd-aadhaar-err" className="text-xs text-[#b23b3b] mt-1">{aadhaarMsg}</p>
          )}
        </div>
      </div>

      {/* Terms */}
      <label className="flex items-start gap-3 mb-6 cursor-pointer">
        <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1 accent-[var(--c-ink)]" />
        <span className="text-sm text-(--c-body) leading-relaxed flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-(--c-accent) shrink-0" />
          I accept the boarding terms &amp; conditions and confirm the details are correct.
        </span>
      </label>

      {/* Honeypot */}
      <input
        type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
        value={website} onChange={(e) => setWebsite(e.target.value)}
        className="absolute left-[-9999px] w-px h-px opacity-0"
      />

      {error && <p className="text-sm text-[#b23b3b] mb-4" role="alert">{error}</p>}
      {!error && blocker && !!duration && (
        <p className="text-xs text-(--c-accent) mb-3" data-testid="brd-blocker">{blocker}</p>
      )}

      <button type="submit" disabled={busy} className={primaryBtn}>
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        {selection && !full ? `Request stay · ${rupee(selection.price)}` : 'Request stay'}
      </button>
      <p className="text-xs text-(--c-accent) mt-3 leading-relaxed">
        Boarding is paid at the clinic. We confirm your booking by phone. Indoor facility is 24×7.
      </p>
    </form>
  );
};
