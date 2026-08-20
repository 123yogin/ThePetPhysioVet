import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchOwnerAppointments, acceptOwnerAppointment, requestOwnerReschedule } from '../api/owner';
import { useFlash } from '../lib/flash';
import { Appointment } from '../lib/types';
import { Icon } from '../components/Icon';
import { humanizeStatus } from '../lib/labels';

export const OwnerAppointmentsScreen: React.FC = () => {
  const { addFlash } = useFlash();

  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('10:00');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: appointments, isLoading, isError, refetch } = useQuery({
    queryKey: ['ownerAppointments'],
    queryFn: fetchOwnerAppointments,
  });

  const handleAcceptDoctorReschedule = async (id: number) => {
    try {
      await acceptOwnerAppointment(id);
      addFlash('Appointment time confirmed with your vet', 'success');
      refetch();
    } catch (err: any) {
      addFlash(err.message || 'Failed to confirm appointment', 'error');
    }
  };

  const openRescheduleModal = (appt: Appointment) => {
    setRescheduleTarget(appt);
    setNewDate(appt.date);
    setNewTime(appt.time ? appt.time.substring(0, 5) : '10:00');
    setReason('');
  };

  const handleRequestRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTarget) return;

    if (!reason.trim()) {
      addFlash('Please state a reason for requesting a reschedule', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await requestOwnerReschedule(rescheduleTarget.id, {
        date: newDate,
        time: newTime,
        reason: reason.trim(),
      });
      addFlash(`Reschedule request sent to your vet for ${rescheduleTarget.pet_name}`, 'success');
      setRescheduleTarget(null);
      refetch();
    } catch (err: any) {
      addFlash(err.message || 'Failed to submit reschedule request', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 className="page-title">My Pet Appointments</h1>
        <p className="page-sub" style={{ margin: 0 }}>Physical therapy sessions, schedule requests & status updates</p>
      </div>

      {isError && (
        <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Could not load your appointments.</span>
          <button onClick={() => refetch()} className="btn btn-ghost btn-sm">
            Retry
          </button>
        </div>
      )}

      {isLoading ? (
        <p style={{ color: 'var(--brown-500)' }}>Loading appointments...</p>
      ) : isError ? null : !appointments || appointments.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ color: 'var(--brown-500)', margin: 0 }}>No appointments scheduled.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {appointments.map((a) => {
            const isReschedulePending = a.status === 'Reschedule Requested';
            const isDoctorRescheduled = a.status === 'Rescheduled';

            return (
              <div
                key={a.id}
                className="glass-card"
                style={{
                  padding: '20px',
                  borderLeft: isReschedulePending
                    ? '5px solid #0d47a1'
                    : isDoctorRescheduled
                    ? '5px solid var(--brown-500)'
                    : '5px solid var(--primary)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--brown-900)' }}>
                        🐕 {a.pet_name}
                      </span>
                      <span className={`badge badge-${isReschedulePending ? 'pending' : (a.status || "confirmed").toLowerCase().replace(/\s+/g, "-")}`}>
                        {isReschedulePending ? 'Reschedule Pending Doctor Approval' : humanizeStatus(a.status)}
                      </span>
                    </div>

                    <div style={{ fontSize: '14px', color: 'var(--brown-800)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Icon name="calendar" size={14} /> <strong>Current Scheduled Time:</strong> {a.date} @ {a.time?.substring(0, 5) || '--:--'}
                    </div>

                    <div style={{ fontSize: '13px', color: 'var(--brown-600)', marginTop: '4px' }}>
                      <strong>Visit Type:</strong> {a.visit_type_display || a.visit_type}
                    </div>

                    {/* Pending Approval Notice */}
                    {isReschedulePending && (
                      <div
                        style={{
                          marginTop: '12px',
                          padding: '12px 16px',
                          borderRadius: '8px',
                          background: 'rgba(21, 101, 192, 0.1)',
                          border: '1px solid rgba(21, 101, 192, 0.25)',
                          fontSize: '13px',
                          color: '#0d47a1',
                        }}
                      >
                        <strong>Requested New Slot:</strong> {a.requested_date} @ {a.requested_time ? a.requested_time.substring(0, 5) : '10:00'}
                        {a.reschedule_reason && (
                          <div style={{ marginTop: '4px', fontStyle: 'italic' }}>
                            <strong>Reason:</strong> "{a.reschedule_reason}"
                          </div>
                        )}
                        <div style={{ marginTop: '4px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Icon name="info" size={12} /> Your vet will review and approve or suggest another time.
                        </div>
                      </div>
                    )}

                    {/* Doctor Rescheduled Notice */}
                    {isDoctorRescheduled && (
                      <div
                        style={{
                          marginTop: '12px',
                          padding: '12px 16px',
                          borderRadius: '8px',
                          background: 'var(--brown-100)',
                          border: '1px solid rgba(62, 39, 35, 0.18)',
                          fontSize: '13px',
                          color: 'var(--brown-700)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <Icon name="bell" size={14} /> <strong>Your vet updated this appointment slot.</strong> Please confirm if this new time works for you.
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {isDoctorRescheduled && (
                      <button
                        onClick={() => handleAcceptDoctorReschedule(a.id)}
                        className="btn btn-primary btn-sm"
                      >
                        <Icon name="check" /> Accept New Time
                      </button>
                    )}

                    {!isReschedulePending && a.status !== 'Completed' && (
                      <button
                        onClick={() => openRescheduleModal(a)}
                        className="btn btn-secondary btn-sm"
                      >
                        <Icon name="refresh" /> Request Reschedule
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reschedule Request Modal */}
      {rescheduleTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div
            className="glass-card"
            style={{
              width: '100%',
              maxWidth: '520px',
              padding: '28px',
              background: '#fff9f4',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--brown-900)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon name="refresh" /> Request Appointment Reschedule
              </h3>
              <button
                onClick={() => setRescheduleTarget(null)}
                aria-label="Close"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--brown-600)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '44px',
                  minHeight: '44px',
                }}
              >
                <Icon name="close" size={20} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--brown-700)', marginBottom: '20px' }}>
              Requesting a new physical therapy slot for <strong>{rescheduleTarget.pet_name}</strong> (Currently scheduled for {rescheduleTarget.date} @ {rescheduleTarget.time?.substring(0, 5) || '--:--'}).
            </p>

            <form onSubmit={handleRequestRescheduleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div className="field">
                  <label>Preferred New Date *</label>
                  <input
                    type="date"
                    className="input-glass"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label>Preferred New Time *</label>
                  <input
                    type="time"
                    className="input-glass"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="field" style={{ marginBottom: '20px' }}>
                <label>Reason for Rescheduling *</label>
                <textarea
                  className="input-glass"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Please state why you need to reschedule (e.g. Travel conflict, pet symptom change, work emergency...)"
                  required
                />
                <span style={{ fontSize: '11px', color: 'var(--brown-500)', marginTop: '4px', display: 'block' }}>
                  * Required so your vet can evaluate your request.
                </span>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setRescheduleTarget(null)}
                  className="btn btn-ghost"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Submitting Request...' : 'Submit Reschedule Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
