import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchOwnerPets, createOwnerPet, createOwnerAppointment, fetchOwnerAppointments } from '../api/owner';
import { createBoarding } from '../api/boarding';
import { fetchAppointmentOptions } from '../api/appointments';
import { fetchMe } from '../api/auth';
import { useFlash } from '../lib/flash';
import { todayISO } from '../lib/dates';
import { isValidAadhaar } from '../lib/aadhaar';
import { Icon } from '../components/Icon';
import { petEmoji, friendlyDate, friendlyTime } from '../lib/labels';
import { Appointment } from '../lib/types';

// Service-specific options, mirroring the public site so the in-app booking
// feels familiar — but this is the APP's own flow (it books an owner
// appointment), kept separate from the website. Keyed by the backend visit-type
// value. Prices match the site's menu.
const SERVICE_PACKAGES: Record<string, { label: string; price: number }[]> = {
  Hydrotherapy: [
    { label: 'Single session (swim & dry)', price: 1300 },
    { label: '5 sessions', price: 900 },
    { label: '8 sessions', price: 1100 },
  ],
  Grooming: [
    { label: 'Shampooing', price: 1200 },
    { label: 'Nail trimming', price: 200 },
    { label: 'Hair clipping', price: 800 },
    { label: 'Swim + groom + shampoo + dry', price: 2500 },
  ],
};
// Walking asks which part of the day suits, like the site's walk options. Each
// maps to a representative clock time for the appointment the clinic confirms.
const WALK_TIMES: { label: string; time: string }[] = [
  { label: 'Morning', time: '09:00' },
  { label: 'Evening', time: '17:00' },
  { label: 'Late', time: '20:00' },
];

// Physiotherapy books a one-hour slot, exactly like the site's slot grid. The
// chosen slot's start becomes the appointment time.
const PHYSIO_SLOTS: { start: string; label: string }[] = [
  { start: '09:30', label: '09:30 – 10:30' },
  { start: '10:30', label: '10:30 – 11:30' },
  { start: '11:30', label: '11:30 – 12:30' },
  { start: '12:30', label: '12:30 – 13:30' },
];

// Request-style services carry no real clock time (the clinic schedules them),
// but an appointment row needs one and (pet, date, time) must be unique — so
// each service gets a distinct placeholder, keeping different same-day requests
// for one pet from colliding. Physiotherapy uses its slot; Walking its part of
// day; these are the rest.
const SERVICE_DEFAULT_TIME: Record<string, string> = {
  Hydrotherapy: '10:00',
  Grooming: '11:00',
  IndoorFacility: '12:00',
};

// Indoor Facility is a duration-priced stay on the site; mirror the same
// duration menu (prices match) as a day-care choice on the owner side.
const BOARDING_DURATIONS: { key: string; label: string; price: number }[] = [
  { key: '1h', label: '1 hour', price: 100 },
  { key: '8h', label: '8 hours', price: 600 },
  { key: '12h', label: '12 hours', price: 800 },
  { key: '24h', label: '24 hours', price: 1200 },
  { key: '48h', label: '48 hours', price: 2000 },
  { key: '1week', label: '1 week', price: 6000 },
  { key: '1month', label: '1 month', price: 21000 },
];

// The owner books the SAME services the public site offers — not the clinic's
// full internal visit-type list (which also holds consultations, re-assessments
// and Laser Therapy). Labelled the way the site does, so "Hydrotherapy" reads
// as Swimming. Backend `value`s are kept exactly; only ones the API actually
// offers are shown, so a booking can never submit a type it would reject.
const OWNER_SERVICES: { value: string; label: string }[] = [
  { value: 'Physiotherapy', label: 'Physiotherapy' },
  { value: 'Hydrotherapy', label: 'Swimming' },
  { value: 'Grooming', label: 'Grooming' },
  { value: 'Walking', label: 'Walking' },
  { value: 'IndoorFacility', label: 'Indoor Facility' },
];

export const OwnerHomeScreen: React.FC = () => {
  const queryClient = useQueryClient();
  const { addFlash } = useFlash();

  const [showAddPet, setShowAddPet] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [showApptModal, setShowApptModal] = useState(false);

  // New Pet State
  const [petName, setPetName] = useState('');
  const [species, setSpecies] = useState('Dog');
  const [breed, setBreed] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('Male');
  const [weight, setWeight] = useState('');
  const [complaint, setComplaint] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  // New Appointment State
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [apptDate, setApptDate] = useState(todayISO());
  const [visitType, setVisitType] = useState('');
  const [reasonNotes, setReasonNotes] = useState('');
  // Website-like, per-service extras — each service books its own way, so only
  // one of these is ever in play at once. All cleared when the service changes.
  const [pkg, setPkg] = useState<{ label: string; price: number } | null>(null);
  const [walkTime, setWalkTime] = useState<{ label: string; time: string } | null>(null);
  const [physioSlot, setPhysioSlot] = useState<{ start: string; label: string } | null>(null);
  const [boarding, setBoarding] = useState<{ key: string; label: string; price: number } | null>(null);
  // Boarding is a real stay (not a plain appointment): it needs the same
  // check-in details the website collects — which walks, an optional Aadhaar,
  // and accepting the terms — so it enters the Pending → Confirmed → Checked-in
  // lifecycle and the owner can see the check-in status.
  const [boardingWalks, setBoardingWalks] = useState<string[]>([]);
  const [boardingAadhaar, setBoardingAadhaar] = useState('');
  const [boardingTerms, setBoardingTerms] = useState(false);

  const chooseService = (value: string) => {
    setVisitType(value);
    setPkg(null);
    setWalkTime(null);
    setPhysioSlot(null);
    setBoarding(null);
    setBoardingWalks([]);
    setBoardingAadhaar('');
    setBoardingTerms(false);
  };
  const toggleBoardingWalk = (key: string) =>
    setBoardingWalks((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const servicePackages = SERVICE_PACKAGES[visitType] ?? null;
  const asksWalkTime = visitType === 'Walking';
  const usesSlots = visitType === 'Physiotherapy';
  const usesDuration = visitType === 'IndoorFacility';
  // Only Physiotherapy ties to a fixed daily grid; the rest are requests the
  // clinic schedules, so they ask a preferred DAY, not a clock time. Boarding
  // asks for a check-in day.
  const dateLabel = usesSlots ? 'Date' : usesDuration ? 'Check-in day' : 'Preferred day';

  const { data: pets, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['ownerPets'],
    queryFn: fetchOwnerPets,
  });

  // Arriving with ?book=1 (e.g. the "Book appointment" button on My Bookings)
  // opens the booking modal straight away instead of landing here and making
  // the owner press Book a second time. The param is cleared once handled so a
  // refresh or Back does not re-open it.
  const [searchParams, setSearchParams] = useSearchParams();
  // Live QA D6: with no pets, ?book=1 used to land on an empty "My Pets" with no
  // word about why the booking did not open. Say so, and offer the next step.
  const [needsPetFirst, setNeedsPetFirst] = useState(false);
  useEffect(() => {
    if (searchParams.get('book') !== '1' || !pets) return;
    if (pets.length === 0) {
      setNeedsPetFirst(true);
      const next = new URLSearchParams(searchParams);
      next.delete('book');
      setSearchParams(next, { replace: true });
      return;
    }
    setSelectedPetId((prev) => prev ?? pets[0].id);
    setShowApptModal(true);
    const next = new URLSearchParams(searchParams);
    next.delete('book');
    setSearchParams(next, { replace: true });
  }, [searchParams, pets, setSearchParams]);

  const { data: appointments } = useQuery({
    queryKey: ['ownerAppointments'],
    queryFn: fetchOwnerAppointments,
  });

  // Single source of truth for bookable visit types — never hardcode this list,
  // the backend only accepts a specific set of values.
  const { data: apptOptions, isLoading: optionsLoading, isError: optionsError, refetch: refetchOptions } = useQuery({
    queryKey: ['appointmentOptions'],
    queryFn: fetchAppointmentOptions,
  });
  const visitTypeOptions = apptOptions?.visit_types ?? [];
  // The public-facing services, in the site's order, limited to what the API
  // currently offers.
  const bookableServices = OWNER_SERVICES.filter((s) =>
    visitTypeOptions.some((v) => v.value === s.value),
  );

  // Default to the first bookable service once the list arrives, so an
  // untouched form can never submit a value the pills never displayed.
  useEffect(() => {
    if (!visitType && bookableServices.length > 0) {
      setVisitType(bookableServices[0].value);
    }
  }, [bookableServices, visitType]);

  // Accounts created before signup required a phone have none, and the clinic
  // cannot ring a client it has no number for. Ask on the one form that needs
  // it; the server stores it on the profile, so it is asked once.
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: fetchMe });
  const needsContactPhone = !!me && !me.phone;

  // Next upcoming appointment per pet, so "when is my pet next seen" is
  // answered on the home screen instead of three taps away.
  const nextApptByPet = new Map<string, Appointment>();
  if (appointments) {
    const todayStr = todayISO();
    for (const a of appointments) {
      if (a.status === 'Cancelled' || a.status === 'Completed') continue;
      if (a.date < todayStr) continue;
      const existing = nextApptByPet.get(a.pet_id);
      if (!existing || a.date < existing.date || (a.date === existing.date && (a.time || '') < (existing.time || ''))) {
        nextApptByPet.set(a.pet_id, a);
      }
    }
  }

  const createPetMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('name', petName);
      fd.append('species', species);
      fd.append('breed', breed);
      fd.append('age', age);
      fd.append('sex', sex);
      fd.append('weight', weight);
      fd.append('complaint', complaint);
      if (needsContactPhone) {
        fd.append('owner_phone', contactPhone.trim());
      }
      return createOwnerPet(fd);
    },
    onSuccess: (newPet) => {
      addFlash(`${petEmoji(newPet.species)} ${newPet.name} has been added.`, 'success');
      queryClient.invalidateQueries({ queryKey: ['ownerPets'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      setShowAddPet(false);
      setShowMoreDetails(false);
      setPetName('');
      setBreed('');
      setAge('');
      setWeight('');
      setComplaint('');
      setContactPhone('');
    },
    onError: (err: any) => {
      addFlash(err?.message || 'Failed to add pet. Please try again.', 'error');
    },
  });

  const createApptMutation = useMutation({
    mutationFn: async (): Promise<{ petName: string; isBoarding: boolean }> => {
      if (!selectedPetId) {
        throw new Error('Please select a pet before booking.');
      }
      if (!visitType) {
        throw new Error('Please choose a service.');
      }
      const petName = pets?.find((p) => p.id === selectedPetId)?.name || 'your pet';

      // Indoor Facility is a real BOARDING stay — collect the same check-in
      // details the website does and create it through the boarding flow, so it
      // gets a status the owner can follow (Pending → Confirmed → Checked in).
      if (usesDuration) {
        if (!boarding) throw new Error('Please pick how long the stay is.');
        if (!boardingTerms) throw new Error('Please accept the terms and conditions to book a stay.');
        if (boardingAadhaar.trim() && !isValidAadhaar(boardingAadhaar)) {
          throw new Error('Please enter a valid 12-digit Aadhaar number, or leave it blank.');
        }
        if (!me?.phone) {
          throw new Error('Please add your phone number in your profile before booking a stay.');
        }
        await createBoarding({
          petName,
          ownerName: [me?.first_name, me?.last_name].filter(Boolean).join(' ') || me?.username || 'Owner',
          ownerPhone: me.phone,
          ownerEmail: me?.email || '',
          checkIn: apptDate,
          duration: boarding.key,
          walkTimes: boardingWalks,
          aadhaar: boardingAadhaar.trim(),
          termsAccepted: boardingTerms,
        });
        return { petName, isBoarding: true };
      }

      // Everything else books an appointment.
      if (usesSlots && !physioSlot) {
        throw new Error('Please pick a time slot.');
      }
      if (servicePackages && !pkg) {
        throw new Error('Please pick a package.');
      }
      if (asksWalkTime && !walkTime) {
        throw new Error('Please choose a preferred time.');
      }
      // Each service resolves its own appointment time the way the site does:
      // Physiotherapy → the chosen slot; Walking → the part of day; everything
      // else is a request the clinic schedules, so a placeholder that the vet
      // confirms.
      const time = usesSlots
        ? physioSlot!.start
        : asksWalkTime
          ? walkTime!.time
          : SERVICE_DEFAULT_TIME[visitType] || '10:00';
      // Fold the service-specific choice into the note the vet reads, exactly
      // like the website records it on a request.
      const reason = [
        pkg ? `${pkg.label} (₹${pkg.price.toLocaleString('en-IN')})` : '',
        walkTime ? `preferred ${walkTime.label.toLowerCase()}` : '',
        reasonNotes,
      ]
        .filter(Boolean)
        .join(' — ');
      await createOwnerAppointment({
        pet_id: selectedPetId,
        date: apptDate,
        time,
        visit_type: visitType,
        reason_notes: reason,
      });
      return { petName, isBoarding: false };
    },
    onSuccess: ({ petName, isBoarding }) => {
      addFlash(
        isBoarding
          ? `Boarding requested for ${petName}. The clinic will confirm and check you in.`
          : `Appointment requested for ${petName} on ${friendlyDate(apptDate)}. Waiting for your vet to confirm.`,
        'success',
      );
      queryClient.invalidateQueries({ queryKey: ['ownerAppointments'] });
      queryClient.invalidateQueries({ queryKey: ['ownerBookings'] });
      setShowApptModal(false);
      setReasonNotes('');
      setPkg(null);
      setWalkTime(null);
      setPhysioSlot(null);
      setBoarding(null);
      setBoardingWalks([]);
      setBoardingAadhaar('');
      setBoardingTerms(false);
    },
    onError: (err: any) => {
      // The (pet, date, time) unique constraint surfaces as a technical
      // "must make a unique set" — say what it means for the owner instead.
      const raw = err?.message || '';
      const friendly = /unique set/i.test(raw)
        ? 'You already have a booking for this pet on that day. Please pick another day.'
        : raw || 'Failed to book. Please try again.';
      addFlash(friendly, 'error');
    },
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="page-title">My Pets</h1>
          <p className="page-sub">Book appointments and keep track of your pet's care</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={() => setShowAddPet(!showAddPet)} className="btn btn-primary btn-sm">
            <Icon name="plus" /> Add a Pet
          </button>
          {pets && pets.length > 0 && (
            <button onClick={() => { setSelectedPetId(pets[0].id); setShowApptModal(true); }} className="btn btn-secondary btn-sm">
              <Icon name="calendar" /> Book Appointment
            </button>
          )}
        </div>
      </div>

      {needsPetFirst && pets && pets.length === 0 && !showAddPet && (
        <div className="alert alert-info" role="status" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span><strong>Add your pet first.</strong> Appointments are booked for a pet, so add yours and then book.</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowAddPet(true)}>
            <Icon name="plus" /> Add your pet
          </button>
        </div>
      )}

      {/* Add Pet Form / Card */}
      {showAddPet && (
        <div className="glass-card" style={{ marginBottom: '24px', padding: '24px', border: '2px solid var(--primary)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--brown-900)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon name="paw" /> Add a Pet
          </h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createPetMutation.mutate();
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div className="field">
                <label>Pet Name *</label>
                <input
                  type="text"
                  className="input-glass"
                  value={petName}
                  onChange={(e) => setPetName(e.target.value)}
                  placeholder="e.g. Bruno"
                  required
                />
              </div>
              <div className="field">
                <label>Species</label>
                <select className="input-glass" value={species} onChange={(e) => setSpecies(e.target.value)}>
                  <option value="Dog">Dog</option>
                  <option value="Cat">Cat</option>
                  <option value="Bird">Bird</option>
                  <option value="Exotic">Exotic Pet</option>
                </select>
              </div>
            </div>

            {needsContactPhone && (
              <div className="field" style={{ marginTop: '12px' }}>
                <label>Your Contact Number *</label>
                <input
                  type="tel"
                  className="input-glass"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+91 98765 12345"
                  required
                />
                <small className="text-muted">So the clinic can reach you about {petName || 'your pet'}.</small>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowMoreDetails((v) => !v)}
              className="btn btn-ghost btn-sm"
              style={{ marginTop: '12px' }}
              aria-expanded={showMoreDetails}
            >
              {showMoreDetails ? 'Hide extra details' : 'Add more details (optional)'}
            </button>

            {showMoreDetails && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <div className="field">
                    <label>Breed</label>
                    <input
                      type="text"
                      className="input-glass"
                      value={breed}
                      onChange={(e) => setBreed(e.target.value)}
                      placeholder="e.g. Labrador Retriever"
                    />
                  </div>
                  <div className="field">
                    <label>Age</label>
                    <input
                      type="text"
                      className="input-glass"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      placeholder="e.g. 3 years"
                    />
                  </div>
                  <div className="field">
                    <label>Sex</label>
                    <select className="input-glass" value={sex} onChange={(e) => setSex(e.target.value)}>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Neutered Male">Neutered Male</option>
                      <option value="Spayed Female">Spayed Female</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Weight (kg)</label>
                    <input
                      type="text"
                      className="input-glass"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder="e.g. 18.5"
                    />
                  </div>
                </div>

                <div className="field" style={{ marginTop: '12px' }}>
                  <label>What's going on? (optional)</label>
                  <textarea
                    className="input-glass"
                    rows={2}
                    value={complaint}
                    onChange={(e) => setComplaint(e.target.value)}
                    placeholder="e.g. limping on the back leg, recent surgery, stiffness after walks..."
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  setShowAddPet(false);
                  setShowMoreDetails(false);
                }}
                className="btn btn-ghost btn-sm"
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={createPetMutation.isPending}>
                {createPetMutation.isPending ? 'Saving...' : 'Save Pet'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Book Appointment Modal / Card */}
      {showApptModal && (
        <div className="glass-card" style={{ marginBottom: '24px', padding: '24px', border: '2px solid var(--primary)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--brown-900)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon name="calendar" /> What would you like to book?
          </h3>
          <p className="page-sub" style={{ fontSize: '13px', marginTop: 0, marginBottom: '16px' }}>
            Pick a service, then choose a time. We&rsquo;ll confirm it with you.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createApptMutation.mutate();
            }}
          >
            {/* Service picker — the website's "what would you like to book?"
                moment, as selectable pills instead of a plain dropdown. */}
            {optionsError ? (
              <p style={{ fontSize: '13px', color: 'var(--brown-600)', marginBottom: '16px' }}>
                Couldn&rsquo;t load services.{' '}
                <button type="button" className="table-link" onClick={() => refetchOptions()}>Try again</button>
              </p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '18px' }}>
                {optionsLoading && <span className="page-sub" style={{ fontSize: '13px' }}>Loading services…</span>}
                {bookableServices.map((opt) => {
                  const on = visitType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => chooseService(opt.value)}
                      style={{
                        padding: '7px 14px',
                        borderRadius: '999px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: '1px solid',
                        borderColor: on ? 'var(--brown-900)' : 'var(--glass-border)',
                        background: on ? 'var(--brown-900)' : 'transparent',
                        color: on ? '#fff' : 'var(--brown-800)',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Physiotherapy — pick a one-hour slot, like the site's grid. */}
            {usesSlots && (
              <div className="field" style={{ marginBottom: '18px' }}>
                <label>Time slot</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
                  {PHYSIO_SLOTS.map((s) => {
                    const on = physioSlot?.start === s.start;
                    return (
                      <button
                        key={s.start}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setPhysioSlot(s)}
                        style={{
                          padding: '9px 12px',
                          borderRadius: '10px',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          border: '1px solid',
                          borderColor: on ? 'var(--brown-900)' : 'var(--glass-border)',
                          background: on ? 'var(--brown-900)' : 'transparent',
                          color: on ? '#fff' : 'var(--brown-800)',
                        }}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Package (Swimming / Grooming) — same menu the site shows. */}
            {servicePackages && (
              <div className="field" style={{ marginBottom: '18px' }}>
                <label>Package</label>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {servicePackages.map((p) => {
                    const on = pkg?.label === p.label;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setPkg(p)}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '10px 12px',
                          borderRadius: '10px',
                          cursor: 'pointer',
                          border: '1px solid',
                          borderColor: on ? 'var(--brown-900)' : 'var(--glass-border)',
                          background: on ? 'var(--brown-900)' : 'transparent',
                          color: on ? '#fff' : 'var(--brown-800)',
                          textAlign: 'left',
                        }}
                      >
                        <span style={{ fontSize: '13px' }}>{p.label}</span>
                        <span style={{ fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap', color: on ? '#fff' : 'var(--primary)' }}>
                          ₹{p.price.toLocaleString('en-IN')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Walk time (Walking) — Morning / Evening / Late, like the site. */}
            {asksWalkTime && (
              <div className="field" style={{ marginBottom: '18px' }}>
                <label>Preferred time</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {WALK_TIMES.map((t) => {
                    const on = walkTime?.label === t.label;
                    return (
                      <button
                        key={t.label}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setWalkTime(on ? null : t)}
                        style={{
                          padding: '7px 14px',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          border: '1px solid',
                          borderColor: on ? 'var(--brown-900)' : 'var(--glass-border)',
                          background: on ? 'var(--brown-900)' : 'transparent',
                          color: on ? '#fff' : 'var(--brown-800)',
                        }}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Indoor Facility — a duration-priced stay, mirroring the site. */}
            {usesDuration && (
              <div className="field" style={{ marginBottom: '18px' }}>
                <label>How long?</label>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {BOARDING_DURATIONS.map((d) => {
                    const on = boarding?.key === d.key;
                    return (
                      <button
                        key={d.key}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setBoarding(d)}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '10px 12px',
                          borderRadius: '10px',
                          cursor: 'pointer',
                          border: '1px solid',
                          borderColor: on ? 'var(--brown-900)' : 'var(--glass-border)',
                          background: on ? 'var(--brown-900)' : 'transparent',
                          color: on ? '#fff' : 'var(--brown-800)',
                          textAlign: 'left',
                        }}
                      >
                        <span style={{ fontSize: '13px' }}>{d.label}</span>
                        <span style={{ fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap', color: on ? '#fff' : 'var(--primary)' }}>
                          ₹{d.price.toLocaleString('en-IN')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Boarding check-in details — the same the website asks, so the
                stay can be confirmed and checked in. */}
            {usesDuration && (
              <>
                <div className="field" style={{ marginBottom: '18px' }}>
                  <label>Walks during the stay (optional)</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {WALK_TIMES.map((t) => {
                      const key = t.label.toLowerCase();
                      const on = boardingWalks.includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleBoardingWalk(key)}
                          style={{
                            padding: '7px 14px',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            border: '1px solid',
                            borderColor: on ? 'var(--brown-900)' : 'var(--glass-border)',
                            background: on ? 'var(--brown-900)' : 'transparent',
                            color: on ? '#fff' : 'var(--brown-800)',
                          }}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="field" style={{ marginBottom: '18px' }}>
                  <label>Aadhaar number (optional)</label>
                  <input
                    className="input-glass"
                    inputMode="numeric"
                    maxLength={12}
                    placeholder="12-digit Aadhaar"
                    value={boardingAadhaar}
                    onChange={(e) => setBoardingAadhaar(e.target.value.replace(/\D/g, ''))}
                  />
                </div>

                <label
                  style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '18px', fontSize: '13px', color: 'var(--brown-800)', cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={boardingTerms}
                    onChange={(e) => setBoardingTerms(e.target.checked)}
                    style={{ marginTop: '3px' }}
                  />
                  <span>
                    I accept the terms and conditions for the stay. Payment is made at the clinic.
                  </span>
                </label>
              </>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div className="field">
                <label>Select Pet</label>
                <select
                  className="input-glass"
                  value={selectedPetId || ''}
                  onChange={(e) => setSelectedPetId(e.target.value)}
                >
                  {pets?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.breed || p.species})
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>{dateLabel}</label>
                <input
                  type="date"
                  className="input-glass"
                  value={apptDate}
                  onChange={(e) => setApptDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="field" style={{ marginTop: '12px' }}>
              <label>Anything your vet should know beforehand (optional)</label>
              <textarea
                className="input-glass"
                rows={2}
                value={reasonNotes}
                onChange={(e) => setReasonNotes(e.target.value)}
                placeholder="Any current symptoms or preferences for this visit..."
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowApptModal(false)} className="btn btn-ghost btn-sm">
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={
                  createApptMutation.isPending ||
                  optionsLoading ||
                  !visitType ||
                  (usesSlots && !physioSlot) ||
                  (!!servicePackages && !pkg) ||
                  (asksWalkTime && !walkTime) ||
                  (usesDuration && (!boarding || !boardingTerms))
                }
              >
                {createApptMutation.isPending
                  ? 'Requesting...'
                  : usesSlots
                    ? 'Request This Slot'
                    : usesDuration
                      ? 'Request Stay'
                      : 'Send Request'}
              </button>
            </div>
          </form>
        </div>
      )}

      {isError && (
        <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Could not load your pets{error instanceof Error && error.message ? `: ${error.message}` : '.'}</span>
          <button onClick={() => refetch()} className="btn btn-ghost btn-sm">
            Retry
          </button>
        </div>
      )}

      {isLoading ? (
        <p>Loading your pets...</p>
      ) : isError ? null : !pets || pets.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ marginBottom: '12px', color: 'var(--brown-500)', display: 'flex', justifyContent: 'center' }}>
            <Icon name="paw" size={40} />
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--brown-900)' }}>No Pets Yet</h3>
          <p style={{ color: 'var(--brown-600)', margin: '8px 0 20px' }}>
            Add your pet's details so your vet can get to know them and plan their care.
          </p>
          <button onClick={() => setShowAddPet(true)} className="btn btn-primary">
            <Icon name="plus" /> Add Your First Pet
          </button>
        </div>
      ) : (
        <div className="grid-cards">
          {pets.map((p) => {
            // Join only the parts that actually exist so a missing weight
            // doesn't leave a trailing "&bull;" with nothing after it.
            const metaParts = [p.breed, p.age, p.weight ? `${p.weight} kg` : null].filter(Boolean);
            const next = nextApptByPet.get(p.id);
            return (
              <div key={p.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', minHeight: '230px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--brown-900)' }}>
                    {petEmoji(p.species)} {p.name}
                  </div>
                  <span className="badge badge-neutral">
                    {p.species || 'Pet'}
                  </span>
                </div>
                {metaParts.length > 0 && (
                  <p style={{ color: 'var(--brown-700)', margin: '8px 0', fontSize: '14px' }}>
                    {metaParts.join(' • ')}
                  </p>
                )}
                {p.complaint && (
                  <p style={{ fontSize: '12px', color: 'var(--brown-600)', background: 'var(--brown-100)', padding: '8px', borderRadius: '8px', marginTop: '8px' }}>
                    <strong>Reason for visit:</strong> {p.complaint}
                  </p>
                )}
                <p style={{ fontSize: '13px', color: next ? 'var(--brown-700)' : 'var(--brown-500)', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Icon name="calendar" size={13} />
                  {next
                    ? `Next visit: ${friendlyDate(next.date)}${next.time ? ` at ${friendlyTime(next.time)}` : ''}`
                    : 'No upcoming appointment'}
                </p>
                <div style={{ marginTop: 'auto', paddingTop: '16px', display: 'flex', gap: '8px' }}>
                  <Link to={`/owner/pets/${p.id}`} className="btn btn-secondary btn-sm" style={{ flex: 1, textDecoration: 'none', textAlign: 'center' }}>
                    View Details &rarr;
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
