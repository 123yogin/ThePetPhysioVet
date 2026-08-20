import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createAppointment } from '../api/appointments';
import { fetchPets } from '../api/pets';
import { useFlash } from '../lib/flash';

export const CreateScreen: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultPetId = searchParams.get('pet') || '';
  const { addFlash } = useFlash();

  const dateParam = searchParams.get('date') || '';

  const [petId, setPetId] = useState(defaultPetId);
  const [visitType, setVisitType] = useState('Initial');
  const [date, setDate] = useState(dateParam || new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('10:00');
  const [reasonNotes, setReasonNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const { data: pets, isLoading: petsLoading, isError: petsError, refetch: refetchPets } = useQuery({
    queryKey: ['pets'],
    queryFn: () => fetchPets(),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!petId) return addFlash('Please select a patient', 'error');

    setLoading(true);
    try {
      const appt = await createAppointment({
        pet: Number(petId),
        visit_type: visitType,
        date,
        time,
        reason_notes: reasonNotes,
      });
      addFlash(`Appointment scheduled for ${appt.pet_name}`, 'success');
      navigate(`/appointments/${appt.id}/share`);
    } catch (err: any) {
      addFlash(err.message || 'Failed to create appointment', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h1 className="page-title">Book New Appointment</h1>
      <p className="page-sub">Schedule a physical therapy assessment or follow-up session</p>

      <form onSubmit={handleSubmit} className="glass-card">
        <div className="field">
          <label>Patient *</label>
          <select
            className="input-glass"
            value={petId}
            onChange={(e) => setPetId(e.target.value)}
            required
          >
            <option value="">
              {petsLoading ? 'Loading patients...' : petsError ? 'Could not load patients' : 'Select Patient...'}
            </option>
            {pets?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.owner_name} - {p.owner_phone})
              </option>
            ))}
          </select>
          {petsError && (
            <div className="alert alert-danger" style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Could not load the patient list.</span>
              <button type="button" onClick={() => refetchPets()} className="btn btn-ghost btn-sm">
                Retry
              </button>
            </div>
          )}
          {!petsLoading && !petsError && pets?.length === 0 && (
            <p style={{ fontSize: '12px', color: 'var(--brown-500)', marginTop: '4px' }}>
              No patients registered yet. Add one first.
            </p>
          )}
        </div>

        <div className="field">
          <label>Visit Type</label>
          <select className="input-glass" value={visitType} onChange={(e) => setVisitType(e.target.value)}>
            <option value="Initial">Initial Consultation & Assessment</option>
            <option value="Follow-up">Follow-up Rehabilitation Session</option>
            <option value="Hydrotherapy">Hydrotherapy Session</option>
            <option value="Laser Therapy">Class IV Laser Therapy</option>
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div className="field">
            <label>Date *</label>
            <input
              type="date"
              className="input-glass"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Time *</label>
            <input
              type="time"
              className="input-glass"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="field">
          <label>Reason / Clinical Notes</label>
          <textarea
            className="input-glass"
            rows={3}
            value={reasonNotes}
            onChange={(e) => setReasonNotes(e.target.value)}
            placeholder="Reason for consultation or specific therapy instructions..."
          />
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Booking...' : 'Confirm Appointment'}
          </button>
          <button type="button" onClick={() => navigate('/appointments')} className="btn btn-ghost">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};
