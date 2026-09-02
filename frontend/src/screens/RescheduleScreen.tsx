import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchAppointmentDetail, rescheduleAppointment } from '../api/appointments';
import { useFlash } from '../lib/flash';

export const RescheduleScreen: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  // useParams gives `string | undefined`. Previously this was `Number(id)`,
  // which quietly turned a missing param into NaN and requested /NaN; an empty
  // string makes the bad case obvious instead of silently 404-ing.
  const apptId = id ?? '';
  const navigate = useNavigate();
  const { addFlash } = useFlash();

  const { data: appt, isLoading, isError, refetch } = useQuery({
    queryKey: ['appointment', apptId],
    queryFn: () => fetchAppointmentDetail(apptId),
    enabled: !!apptId,
  });

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('11:00');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (appt) {
      if (appt.date) setDate(appt.date);
      if (appt.time) setTime(appt.time.substring(0, 5));
    }
  }, [appt]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await rescheduleAppointment(apptId, { date, time });
      addFlash('Appointment rescheduled successfully', 'success');
      navigate(`/appointments/${apptId}/share`);
    } catch (err: any) {
      addFlash(err.message || 'Failed to reschedule', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <p>Loading appointment...</p>;

  if (isError) {
    return (
      <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Could not load this appointment.</span>
        <button onClick={() => refetch()} className="btn btn-ghost btn-sm">
          Retry
        </button>
      </div>
    );
  }

  if (!appt) return <p>Appointment not found.</p>;

  return (
    <div style={{ maxWidth: '540px', margin: '0 auto' }}>
      <h1 className="page-title">Reschedule Appointment</h1>
      <p className="page-sub">Change session time for {appt.pet_name} (Owner: {appt.owner_name})</p>

      <form onSubmit={handleSubmit} className="glass-card">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div className="field">
            <label>New Date</label>
            <input
              type="date"
              className="input-glass"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>New Time</label>
            <input
              type="time"
              className="input-glass"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving...' : 'Update Appointment'}
          </button>
          <button type="button" onClick={() => navigate('/appointments')} className="btn btn-ghost">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};
