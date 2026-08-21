import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchOwnerPets, createOwnerPet, createOwnerAppointment, fetchOwnerAppointments } from '../api/owner';
import { fetchAppointmentOptions } from '../api/appointments';
import { useFlash } from '../lib/flash';
import { Icon } from '../components/Icon';
import { petEmoji, friendlyDate, friendlyTime } from '../lib/labels';
import { Appointment } from '../lib/types';

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

  // New Appointment State
  const [selectedPetId, setSelectedPetId] = useState<number | null>(null);
  const [apptDate, setApptDate] = useState(new Date().toISOString().slice(0, 10));
  const [apptTime, setApptTime] = useState('10:00');
  const [visitType, setVisitType] = useState('');
  const [reasonNotes, setReasonNotes] = useState('');

  const { data: pets, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['ownerPets'],
    queryFn: fetchOwnerPets,
  });

  const { data: appointments } = useQuery({
    queryKey: ['ownerAppointments'],
    queryFn: fetchOwnerAppointments,
  });

  // Single source of truth for bookable visit types — never hardcode this list,
  // the backend only accepts a specific set of values.
  const { data: apptOptions, isLoading: optionsLoading, isError: optionsError } = useQuery({
    queryKey: ['appointmentOptions'],
    queryFn: fetchAppointmentOptions,
  });
  const visitTypeOptions = apptOptions?.visit_types ?? [];

  // Default the select to a real option once the list arrives, so an
  // untouched select can never submit a value the UI never displayed.
  useEffect(() => {
    if (!visitType && visitTypeOptions.length > 0) {
      setVisitType(visitTypeOptions[0].value);
    }
  }, [visitTypeOptions, visitType]);

  // Next upcoming appointment per pet, so "when is my pet next seen" is
  // answered on the home screen instead of three taps away.
  const nextApptByPet = new Map<number, Appointment>();
  if (appointments) {
    const todayStr = new Date().toISOString().slice(0, 10);
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
      return createOwnerPet(fd);
    },
    onSuccess: (newPet) => {
      addFlash(`${petEmoji(newPet.species)} ${newPet.name} has been added.`, 'success');
      queryClient.invalidateQueries({ queryKey: ['ownerPets'] });
      setShowAddPet(false);
      setShowMoreDetails(false);
      setPetName('');
      setBreed('');
      setAge('');
      setWeight('');
      setComplaint('');
    },
    onError: (err: any) => {
      addFlash(err?.message || 'Failed to add pet. Please try again.', 'error');
    },
  });

  const createApptMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPetId) {
        throw new Error('Please select a pet before booking an appointment.');
      }
      if (!visitType) {
        throw new Error('Please choose an appointment type.');
      }
      return createOwnerAppointment({
        pet_id: selectedPetId,
        date: apptDate,
        time: apptTime,
        visit_type: visitType,
        reason_notes: reasonNotes,
      });
    },
    onSuccess: (newAppt) => {
      addFlash(
        `Appointment requested for ${newAppt.pet_name} on ${friendlyDate(newAppt.date)}. Waiting for your vet to confirm.`,
        'success'
      );
      queryClient.invalidateQueries({ queryKey: ['ownerAppointments'] });
      setShowApptModal(false);
      setReasonNotes('');
    },
    onError: (err: any) => {
      addFlash(err?.message || 'Failed to book appointment. Please try again.', 'error');
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
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--brown-900)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon name="calendar" /> Book an Appointment
          </h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createApptMutation.mutate();
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div className="field">
                <label>Select Pet</label>
                <select
                  className="input-glass"
                  value={selectedPetId || ''}
                  onChange={(e) => setSelectedPetId(Number(e.target.value))}
                >
                  {pets?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.breed || p.species})
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Date</label>
                <input
                  type="date"
                  className="input-glass"
                  value={apptDate}
                  onChange={(e) => setApptDate(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label>Time</label>
                <input
                  type="time"
                  className="input-glass"
                  value={apptTime}
                  onChange={(e) => setApptTime(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label>Appointment Type</label>
                {optionsError ? (
                  <p style={{ fontSize: '13px', color: 'var(--brown-600)' }}>
                    Couldn't load appointment types. <button type="button" className="table-link" onClick={() => window.location.reload()}>Reload the page</button>
                  </p>
                ) : (
                  <select
                    className="input-glass"
                    value={visitType}
                    onChange={(e) => setVisitType(e.target.value)}
                    disabled={optionsLoading}
                  >
                    {optionsLoading && <option value="">Loading...</option>}
                    {visitTypeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}
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
              <button type="submit" className="btn btn-primary btn-sm" disabled={createApptMutation.isPending || optionsLoading}>
                {createApptMutation.isPending ? 'Requesting...' : 'Request This Time'}
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
