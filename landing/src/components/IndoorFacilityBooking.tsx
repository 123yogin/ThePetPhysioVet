import React from 'react';
import { CalendarCheck, Check, Loader2, ShieldCheck } from 'lucide-react';
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

interface Props {
  onClose: () => void;
}


import { field, labelCls, primaryBtn } from '../lib/formStyles';
import { rupee } from '../lib/format';

export const IndoorFacilityBooking: React.FC<Props> = ({ onClose }) => {
  const [menu, setMenu] = React.useState<Menu | null>(null);
  const minDate = React.useMemo(() => isoDate(0), []);
  const maxDate = React.useMemo(() => isoDate(90), []);

  const [duration, setDuration] = React.useState('');
  const [date, setDate] = React.useState(minDate);
  const [selection, setSelection] = React.useState<Selection | null>(null);
  const [checking, setChecking] = React.useState(false);

  const [form, setForm] = React.useState({
    petName: '', ownerName: '', ownerPhone: '', ownerEmail: '', aadhaar: '',
  });
  const [walkTimes, setWalkTimes] = React.useState<string[]>([]);
  const [terms, setTerms] = React.useState(false);
  const [website, setWebsite] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
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
  }, [duration, date]);

  const toggleWalk = (key: string) =>
    setWalkTimes((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const aadhaarOk = isValidAadhaar(form.aadhaar);
  const full = !!selection && selection.available <= 0;
  const canSubmit =
    !!duration && !!date && !full &&
    form.petName.trim() && form.ownerName.trim() && form.ownerPhone.trim() &&
    aadhaarOk && terms && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      setError(
        !aadhaarOk ? 'Please enter a valid 12-digit Aadhaar number.'
          : !terms ? 'Please accept the terms and conditions.'
            : 'Please fill in the required fields.',
      );
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${CLINIC_API}/facility/boarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          petName: form.petName, ownerName: form.ownerName, ownerPhone: form.ownerPhone,
          ownerEmail: form.ownerEmail || undefined,
          checkIn: date, duration,
          walkTimes,
          aadhaar: form.aadhaar.replace(/\s/g, ''),
          termsAccepted: terms,
          website,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.detail || 'We could not book that stay. Please try again.');
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

      {/* Duration + price */}
      <span className={labelCls}>Duration</span>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {(menu?.durations ?? []).map((d) => {
          const on = duration === d.key;
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
              : `${selection.available} of ${menu?.capacity ?? 6} beds free · until ${selection.check_out} · ${rupee(selection.price)}`
            : 'Pick a duration to see availability.'}
      </p>

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
            <input id="brd-phone" className={field} value={form.ownerPhone} onChange={(e) => set('ownerPhone', e.target.value)} placeholder="e.g. 98765 43210" />
          </div>
          <div>
            <label className={labelCls} htmlFor="brd-email">Email</label>
            <input id="brd-email" className={field} value={form.ownerEmail} onChange={(e) => set('ownerEmail', e.target.value)} placeholder="Optional" />
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
          />
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

      <button type="submit" disabled={!canSubmit} className={primaryBtn}>
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        {selection && !full ? `Request stay · ${rupee(selection.price)}` : 'Request stay'}
      </button>
      <p className="text-xs text-(--c-accent) mt-3 leading-relaxed">
        Boarding is paid at the clinic. We confirm your booking by phone. Indoor facility is 24×7.
      </p>
    </form>
  );
};
