import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchOwnerPets, createOwnerPet, createOwnerAppointment } from '../api/owner';
import { useFlash } from '../lib/flash';

export const OwnerHomeScreen: React.FC = () => {
  const queryClient = useQueryClient();
  const { addFlash } = useFlash();

  const [showAddPet, setShowAddPet] = useState(false);
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
  const [visitType, setVisitType] = useState('Initial Consultation');
  const [reasonNotes, setReasonNotes] = useState('');

  const { data: pets, isLoading, isError, refetch } = useQuery({
    queryKey: ['ownerPets'],
    queryFn: fetchOwnerPets,
  });

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
      addFlash(`🐕 ${newPet.name} registered! Reflected in your vet's patient roster.`, 'success');
      queryClient.invalidateQueries({ queryKey: ['ownerPets'] });
      setShowAddPet(false);
      setPetName('');
      setBreed('');
      setAge('');
      setWeight('');
      setComplaint('');
    },
    onError: () => {
      addFlash('Failed to register pet. Please try again.', 'error');
    },
  });

  const createApptMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPetId) {
        throw new Error('Please select a pet before booking an appointment.');
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
      addFlash(`📅 Appointment booked for ${newAppt.pet_name} on ${newAppt.date} with your vet!`, 'success');
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
          <h1 className="page-title">My Registered Pets</h1>
          <p className="page-sub">Physical therapy schedules, assessments & clinical care by your vet</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setShowAddPet(!showAddPet)} className="btn btn-primary btn-sm">
            ➕ Add New Pet
          </button>
          {pets && pets.length > 0 && (
            <button onClick={() => { setSelectedPetId(pets[0].id); setShowApptModal(true); }} className="btn btn-secondary btn-sm">
              📅 Book Appointment
            </button>
          )}
        </div>
      </div>

      {/* Add Pet Form / Card */}
      {showAddPet && (
        <div className="glass-card" style={{ marginBottom: '24px', padding: '24px', border: '2px solid var(--primary)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--brown-900)', marginBottom: '16px' }}>
            🐾 Register Your Pet Profile
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
              <label>Presenting Mobility Complaint / Notes</label>
              <textarea
                className="input-glass"
                rows={2}
                value={complaint}
                onChange={(e) => setComplaint(e.target.value)}
                placeholder="Describe stiffness, limp, surgical history or physical rehabilitation needs..."
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowAddPet(false)} className="btn btn-ghost btn-sm">
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={createPetMutation.isPending}>
                {createPetMutation.isPending ? 'Registering...' : 'Save & Link to My Clinic'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Book Appointment Modal / Card */}
      {showApptModal && (
        <div className="glass-card" style={{ marginBottom: '24px', padding: '24px', border: '2px solid var(--primary)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--brown-900)', marginBottom: '16px' }}>
            📅 Book Therapy Appointment with your vet
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
                <label>Session / Visit Type</label>
                <select className="input-glass" value={visitType} onChange={(e) => setVisitType(e.target.value)}>
                  <option value="Initial Assessment">Initial Assessment</option>
                  <option value="Laser Therapy">Laser Therapy Session</option>
                  <option value="Hydrotherapy">Hydrotherapy Session</option>
                  <option value="Follow-up Rehab">Follow-up Physical Rehab</option>
                </select>
              </div>
            </div>

            <div className="field" style={{ marginTop: '12px' }}>
              <label>Notes for your vet</label>
              <textarea
                className="input-glass"
                rows={2}
                value={reasonNotes}
                onChange={(e) => setReasonNotes(e.target.value)}
                placeholder="Any current symptoms or preferred session requests..."
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowApptModal(false)} className="btn btn-ghost btn-sm">
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={createApptMutation.isPending}>
                {createApptMutation.isPending ? 'Booking...' : 'Confirm Appointment Request'}
              </button>
            </div>
          </form>
        </div>
      )}

      {isError && (
        <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Could not load your pets.</span>
          <button onClick={() => refetch()} className="btn btn-ghost btn-sm">
            Retry
          </button>
        </div>
      )}

      {isLoading ? (
        <p>Loading your pets...</p>
      ) : isError ? null : !pets || pets.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🐾</div>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--brown-900)' }}>No Pets Registered Yet</h3>
          <p style={{ color: 'var(--brown-600)', margin: '8px 0 20px' }}>
            Register your pet profile so your vet can assess and design custom physiotherapy care plans.
          </p>
          <button onClick={() => setShowAddPet(true)} className="btn btn-primary">
            ➕ Register Your First Pet
          </button>
        </div>
      ) : (
        <div className="grid-cards">
          {pets.map((p) => (
            <div key={p.id} className="glass-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--brown-900)' }}>
                  🐕 {p.name}
                </div>
                <span className="badge badge-success">
                  {p.species || 'Patient'}
                </span>
              </div>
              <p style={{ color: 'var(--brown-700)', margin: '8px 0', fontSize: '14px' }}>
                {p.breed || 'Rehab Patient'} &bull; {p.age || 'Age N/A'} &bull; {p.weight ? `${p.weight} kg` : ''}
              </p>
              {p.complaint && (
                <p style={{ fontSize: '12px', color: 'var(--brown-600)', background: 'rgba(0,0,0,0.03)', padding: '8px', borderRadius: '8px', marginTop: '8px' }}>
                  <strong>Condition:</strong> {p.complaint}
                </p>
              )}
              <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                <Link to={`/owner/pets/${p.id}`} className="btn btn-secondary btn-sm" style={{ flex: 1, textDecoration: 'none', textAlign: 'center' }}>
                  View Care Records &rarr;
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
