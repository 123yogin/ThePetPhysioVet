import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchOwnerAppointments, acceptOwnerAppointment, requestOwnerReschedule, cancelOwnerAppointment } from '../api/owner';
import { useFlash } from '../lib/flash';
import { Appointment } from '../lib/types';
import { Icon } from '../components/Icon';
import { humanizeStatus, petEmoji, friendlyDate, friendlyTime } from '../lib/labels';

const CLOSED_STATUSES = ['Completed', 'Cancelled'];

export const OwnerAppointmentsScreen: React.FC = () => {
  const { addFlash } = useFlash();
  const queryClient = useQueryClient();

  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('10:00');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const { data: appointments, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['ownerAppointments'],
    queryFn: fetchOwnerAppointments,
  });

  const handleAcceptDoctorReschedule = async (id: string) => {
    try {
      await acceptOwnerAppointment(id);
      addFlash('Appointment time confirmed with your vet', 'success');
      refetch();
    } catch (err: any) {
      addFlash(err?.message || 'Failed to confirm appointment', 'error');
    }
  };

  const handleCancel = async (id: string) => {
    setCancelingId(id);
    try {
      await cancelOwnerAppointment(id);
      addFlash('Appointment cancelled.', 'success');
      setConfirmCancelId(null);
      queryClient.invalidateQueries({ queryKey: ['ownerAppointments'] });
      refetch();
    } catch (err: any) {
      addFlash(err?.message || 'Failed to cancel this appointment. Please try again.', 'error');
    } finally {
      setCancelingId(null);
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
      addFlash(err?.message || 'Failed to submit reschedule request', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  const all = appointments ?? [];
  const sortKey = (a: Appointment) => `${a.date}T${a.time || '00:00'}`;
  const upcoming = all
    .filter((a) => !CLOSED_STATUSES.includes(a.status) && a.date >= todayStr)
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const past = all
    .filter((a) => CLOSED_STATUSES.includes(a.status) || a.date < todayStr)
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)));

  const renderCard = (a: Appointment) => {
    const isReschedulePending = a.status === 'Reschedule Requested';
    const isDoctorRescheduled = a.status === 'Rescheduled';
    const isPending = a.status === 'Pending';
    const isClosed = CLOSED_STATUSES.includes(a.status);
    const canAct = !isReschedulePending && !isClosed;

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
                {petEmoji()} {a.pet_name}
              </span>
              <span className={`badge badge-${isReschedulePending ? 'pending' : (a.status || 'confirmed').toLowerCase().replace(/\s+/g, '-')}`}>
                {isReschedulePending ? 'Reschedule Pending' : humanizeStatus(a.status)}
              </span>
            </div>

            <div style={{ fontSize: '14px', color: 'var(--brown-800)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon name="calendar" size={14} /> {friendlyDate(a.date)}{a.time ? ` at ${friendlyTime(a.time)}` : ''}
            </div>

            <div style={{ fontSize: '13px', color: 'var(--brown-600)', marginTop: '4px' }}>
              {a.visit_type_display || a.visit_type}
            </div>

            {/* Pending doctor confirmation */}
            {isPending && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'rgba(21, 101, 192, 0.1)',
                  border: '1px solid rgba(21, 101, 192, 0.25)',
                  fontSize: '13px',
                  color: '#0d47a1',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Icon name="clock" size={14} /> Waiting for your vet to confirm this time.
              </div>
            )}

            {/* Pending Reschedule Approval Notice */}
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
                <strong>Requested new time:</strong> {friendlyDate(a.requested_date)}
                {a.requested_time ? ` at ${friendlyTime(a.requested_time)}` : ''}
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

            {confirmCancelId === a.id && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: 'rgba(198, 40, 40, 0.1)',
                  border: '1px solid rgba(198, 40, 40, 0.25)',
                  fontSize: '13px',
                  color: '#b71c1c',
                }}
              >
                <div style={{ marginBottom: '8px' }}>Cancel this appointment? This can't be undone.</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleCancel(a.id)}
                    className="btn btn-sm"
                    disabled={cancelingId === a.id}
                    style={{ background: '#b71c1c', color: '#fff', border: '1px solid #b71c1c' }}
                  >
                    {cancelingId === a.id ? 'Cancelling...' : 'Yes, Cancel It'}
                  </button>
                  <button
                    onClick={() => setConfirmCancelId(null)}
                    className="btn btn-ghost btn-sm"
                    disabled={cancelingId === a.id}
                  >
                    No, Keep It
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {isDoctorRescheduled && (
              <button
                onClick={() => handleAcceptDoctorReschedule(a.id)}
                className="btn btn-primary btn-sm"
              >
                <Icon name="check" /> Accept New Time
              </button>
            )}

            {canAct && (
              <button
                onClick={() => openRescheduleModal(a)}
                className="btn btn-secondary btn-sm"
              >
                <Icon name="refresh" /> Request Reschedule
              </button>
            )}

            {canAct && confirmCancelId !== a.id && (
              <button
                onClick={() => setConfirmCancelId(a.id)}
                className="btn btn-ghost btn-sm"
              >
                <Icon name="close" /> Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 className="page-title">My Appointments</h1>
        <p className="page-sub" style={{ margin: 0 }}>Upcoming visits, reschedule requests & status updates</p>
      </div>

      {isError && (
        <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Could not load your appointments{error instanceof Error && error.message ? `: ${error.message}` : '.'}</span>
          <button onClick={() => refetch()} className="btn btn-ghost btn-sm">
            Retry
          </button>
        </div>
      )}

      {isLoading ? (
        <p style={{ color: 'var(--brown-500)' }}>Loading appointments...</p>
      ) : isError ? null : all.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ color: 'var(--brown-500)', margin: 0 }}>No appointments scheduled.</p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '28px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--brown-900)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '12px' }}>
              Upcoming
            </h2>
            {upcoming.length === 0 ? (
              <div className="glass-card" style={{ textAlign: 'center', padding: '24px' }}>
                <p style={{ color: 'var(--brown-500)', margin: 0 }}>No upcoming appointments.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {upcoming.map(renderCard)}
              </div>
            )}
          </div>

          {past.length > 0 && (
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--brown-900)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '12px' }}>
                Past Visits
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {past.map(renderCard)}
              </div>
            </div>
          )}
        </>
      )}

      {/* Reschedule Request Modal */}
      {rescheduleTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
            overflowY: 'auto',
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
              maxHeight: '90vh',
              overflowY: 'auto',
              marginTop: '24px',
              marginBottom: '24px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--brown-900)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon name="refresh" /> Request a Reschedule
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
              Requesting a new time for <strong>{rescheduleTarget.pet_name}</strong> (currently {friendlyDate(rescheduleTarget.date)}
              {rescheduleTarget.time ? ` at ${friendlyTime(rescheduleTarget.time)}` : ''}).
            </p>

            <form onSubmit={handleRequestRescheduleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '16px' }}>
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
                  placeholder="Please state why you need to reschedule (e.g. travel conflict, pet's condition, work emergency...)"
                  required
                />
                <span style={{ fontSize: '11px', color: 'var(--brown-500)', marginTop: '4px', display: 'block' }}>
                  * Required so your vet can review your request.
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
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
