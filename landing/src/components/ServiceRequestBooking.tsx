import React from 'react';
import { CalendarCheck, Check, Loader2 } from 'lucide-react';

/**
 * A slot-less booking REQUEST — used by Swimming, Grooming and Walking.
 *
 * Only Physiotherapy reserves a real one-hour slot (see FacilitySlotBooking).
 * The other services do not run on the hourly clinic grid: the owner picks a
 * package (Swimming / Grooming) or a preferred time (Walking) and a preferred
 * day, and the clinic calls back to schedule. So this is a request the vet
 * triages, not a held seat — it posts to the same /enquiries pipeline the
 * "we'll call you" form uses, with the chosen package / time / day written into
 * the reason the clinic reads.
 */

import { isoDate, postEnquiry } from '../lib/clinicApi';
import { BOOKABLE_SERVICES } from '../data/bookableServices';

interface Package { label: string; price: number; compareAt?: number }

interface Props {
  onClose: () => void;
  /** Service code sent to the API (e.g. Hydrotherapy, Grooming, Walking). */
  serviceCode: string;
  /** Human label recorded in the reason. */
  serviceLabel: string;
  /** Package menu — when present the owner must pick one; it and its price are
      recorded on the request. */
  packages?: Package[];
  /** Ask which part of the day suits (Walking) — the same Morning / Evening /
      Late choice the Indoor Facility uses for its walks. */
  askTimeOfDay?: boolean;
}

/** The parts of the day a walk can be booked for — kept in step with the
    Indoor Facility's walk options. */
const WALK_TIMES = ['Morning', 'Evening', 'Late'];


import { field, labelCls, primaryBtn } from '../lib/formStyles';
import { rupee } from '../lib/format';
import { isPlausiblePhone, PHONE_HINT } from '../lib/errors';

export const ServiceRequestBooking: React.FC<Props> = ({
  onClose,
  serviceCode,
  serviceLabel,
  packages,
  askTimeOfDay,
}) => {
  const minDate = React.useMemo(() => isoDate(0), []);
  const maxDate = React.useMemo(() => isoDate(90), []);

  const [pkg, setPkg] = React.useState<Package | null>(null);
  const [date, setDate] = React.useState(minDate);
  const [timeOfDay, setTimeOfDay] = React.useState('');
  const [form, setForm] = React.useState({ petName: '', ownerName: '', email: '', phone: '', note: '' });
  const [website, setWebsite] = React.useState(''); // honeypot
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [booked, setBooked] = React.useState<{ reference: string; detail: string } | null>(null);

  // Swimming's packages are volume-pricing tiers of one service (5/8
  // sessions discounted off the single-session rate); Grooming's priceList
  // is unrelated services at their own prices, so only an entry with its own
  // `compareAt` (a combo, priced against its parts) gets a badge. `pricingMode` is read from the canonical service record
  // (bookableServices.ts) rather than hardcoded here, so the gate is
  // data-driven and keyed off whichever service this form was opened for.
  const isPerSessionTiers =
    BOOKABLE_SERVICES.find((s) => s.code === serviceCode)?.pricingMode === 'per-session';
  const baselinePrice =
    isPerSessionTiers && packages?.length ? Math.max(...packages.map((p) => p.price)) : null;
  const discountPctFor = (p: Package): number | null => {
    const baseline = p.compareAt ?? baselinePrice;
    if (baseline === null || p.price >= baseline) return null;
    return Math.round(((baseline - p.price) / baseline) * 100);
  };

  const missingPackage = !!packages?.length && !pkg;
  const missingTime = !!askTimeOfDay && !timeOfDay;
  // Live QA D2: the button used to be disabled with no word about why (an empty
  // "Your name" was enough). It now stays enabled and a press lists what is
  // still needed, in form order.
  const problems = [
    missingPackage && 'Choose a package above.',
    missingTime && 'Choose a preferred time above.',
    !form.petName.trim() && 'Enter your pet\u2019s name.',
    !form.ownerName.trim() && 'Enter your name.',
    !form.phone.trim() ? 'Enter a phone number.' : !isPlausiblePhone(form.phone) && PHONE_HINT,
    !form.email.trim() ? 'Enter your email.' : !/^\S+@\S+\.\S+$/.test(form.email.trim()) && 'Enter a valid email address.',
  ].filter(Boolean) as string[];
  const [attempted, setAttempted] = React.useState(false);
  // An edit means the last server error no longer describes the form (D3).
  const edit = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setError('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (problems.length) return;
    setBusy(true);
    setError('');

    const prettyDate = new Date(date).toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    const reason = [
      serviceLabel,
      pkg ? `${pkg.label} (${rupee(pkg.price)})` : '',
      `preferred day ${prettyDate}`,
      timeOfDay ? `preferred ${timeOfDay.toLowerCase()}` : '',
      form.note,
    ]
      .filter(Boolean)
      .join(' — ');

    try {
      const data = await postEnquiry({
        firstName: form.ownerName,
        petName: form.petName,
        email: form.email,
        phone: form.phone,
        reason,
        service: serviceCode || undefined,
        preferredDate: date || undefined,
        website,
      });
      setBooked({
        reference: data.reference,
        detail:
          data.detail ||
          `Thanks, ${form.ownerName}! We have your request for ${serviceLabel} and will call you to confirm a time.`,
      });
    } catch (err) {
      // postEnquiry throws with the API's RFC-7807 `detail` sentence; surface it.
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
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
        <h4 className="font-(family-name:--f-display) text-2xl text-(--c-ink) font-light mb-3">
          Request sent
        </h4>
        <p className="font-(family-name:--f-body) text-sm text-(--c-body) leading-relaxed mb-5">
          {booked.detail}
        </p>
        {booked.reference && (
          <p className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-6">
            Reference {booked.reference}
          </p>
        )}
        <button type="button" onClick={onClose} className={primaryBtn}>
          Done
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="pt-2">
      {packages && packages.length > 0 && (
        <div className="mb-6">
          <span className={labelCls}>Package</span>
          <div className="grid grid-cols-1 gap-2">
            {packages.map((p) => {
              const on = pkg?.label === p.label;
              const discountPct = discountPctFor(p);
              return (
                <button
                  key={p.label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPkg(p)}
                  className={`flex items-center justify-between gap-4 text-left p-3 border transition-colors ${
                    on
                      ? 'border-(--c-ink) bg-(--c-ink) text-white'
                      : 'border-(--c-line) text-(--c-ink) hover:border-(--c-accent)'
                  }`}
                >
                  <span className="flex flex-col gap-1">
                    <span className="text-sm">{p.label}</span>
                    {discountPct !== null && (
                      <span
                        className={`inline-flex w-fit items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          on
                            ? 'border-white text-white'
                            : 'border-(--c-accent) text-(--c-accent)'
                        }`}
                      >
                        Save {discountPct}%
                      </span>
                    )}
                  </span>
                  <span
                    className={`text-sm font-medium whitespace-nowrap ${
                      on ? 'text-white' : 'text-(--c-accent)'
                    }`}
                  >
                    {rupee(p.price)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-5">
        <CalendarCheck className="w-4 h-4" />
        When would suit you?
      </p>

      <label className={labelCls} htmlFor="req-date">
        Preferred day
      </label>
      <input
        id="req-date"
        type="date"
        value={date}
        min={minDate}
        max={maxDate}
        onChange={(e) => setDate(e.target.value || minDate)}
        className={`${field} mb-6`}
      />

      {askTimeOfDay && (
        <div className="mb-6">
          <span className={labelCls}>Preferred time</span>
          <div className="flex flex-wrap gap-2">
            {WALK_TIMES.map((t) => {
              const on = timeOfDay === t;
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTimeOfDay(on ? '' : t)}
                  className={`px-3.5 py-1.5 text-sm border transition-colors ${
                    on
                      ? 'border-(--c-ink) bg-(--c-ink) text-white'
                      : 'border-(--c-line) text-(--c-body) hover:border-(--c-accent)'
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label className={labelCls} htmlFor="req-pet">
            Pet&rsquo;s name *
          </label>
          <input
            id="req-pet"
            className={field}
            placeholder="e.g. Bruno"
            value={form.petName}
            onChange={(e) => edit({ petName: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className={labelCls} htmlFor="req-owner">
              Your name *
            </label>
            <input
              id="req-owner"
              className={field}
              placeholder="e.g. Priya"
              value={form.ownerName}
              onChange={(e) => edit({ ownerName: e.target.value })}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="req-phone">
              Phone *
            </label>
            <input
              id="req-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              aria-required="true"
              className={field}
              placeholder="e.g. 98765 43210"
              value={form.phone}
              onChange={(e) => edit({ phone: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="req-email">
            Email *
          </label>
          <input
            id="req-email"
            type="email"
            className={field}
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => edit({ email: e.target.value })}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="req-note">
            Anything we should know?
          </label>
          <input
            id="req-note"
            className={field}
            placeholder="Optional"
            value={form.note}
            onChange={(e) => edit({ note: e.target.value })}
          />
        </div>
      </div>

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

      {error && <p role="alert" className="text-sm text-[#b23b3b] mt-4">{error}</p>}
      {attempted && problems.length > 0 ? (
        <ul role="alert" className="text-sm text-[#b23b3b] mt-4 space-y-1">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      ) : (
        <>
          {missingPackage && (
            <p className="text-xs text-(--c-accent) mt-4">Choose a package above to continue.</p>
          )}
          {missingTime && (
            <p className="text-xs text-(--c-accent) mt-2">Choose a preferred time above to continue.</p>
          )}
        </>
      )}

      <button type="submit" disabled={busy} aria-busy={busy} className={`${primaryBtn} mt-6`}>
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        Send request
      </button>
      <p className="text-xs text-(--c-accent) mt-3 leading-relaxed">
        This is a request — the clinic will call you to confirm a time. Payment is at the clinic.
      </p>
    </form>
  );
};
