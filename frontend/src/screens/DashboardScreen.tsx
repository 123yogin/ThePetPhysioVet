import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchDashboardStats, completeAppointment, confirmAppointment } from '../api/appointments';
import { useFlash } from '../lib/flash';
import { Icon } from '../components/Icon';
import { humanizeStatus } from '../lib/labels';

export const DashboardScreen: React.FC = () => {
  const { addFlash } = useFlash();
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  const {
    data: stats,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: fetchDashboardStats,
  });

  const handleComplete = async (apptId: number) => {
    try {
      await completeAppointment(apptId);
      addFlash('Appointment marked as Completed', 'success');
      refetch();
    } catch (err: any) {
      addFlash(err.message || 'Failed to complete appointment', 'error');
    }
  };

  const handleConfirm = async (apptId: number) => {
    setConfirmingId(apptId);
    try {
      await confirmAppointment(apptId);
      addFlash('Appointment confirmed', 'success');
      refetch();
    } catch (err: any) {
      addFlash(err.message || 'Failed to confirm appointment', 'error');
    } finally {
      setConfirmingId(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="page-title">Clinic Dashboard</h1>
          <p className="page-sub">
            {stats?.today_display || 'Today\'s physical therapy schedule & overview'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Link to="/appointments/new" className="btn btn-primary">
            + New Appointment
          </Link>
          <Link to="/patients/new" className="btn btn-secondary">
            + New Patient
          </Link>
        </div>
      </div>

      {isError && (
        <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Could not load dashboard stats. Please try again.</span>
          <button onClick={() => refetch()} className="btn btn-ghost btn-sm">
            <Icon name="refresh" /> Retry
          </button>
        </div>
      )}

      {/* Overview Stat Tiles */}
      <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className="glass-card">
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--brown-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Today's Scheduled Visits
          </div>
          <div style={{ fontSize: '32px', fontWeight: '800', color: 'var(--brown-900)', marginTop: '8px' }}>
            {isLoading ? '...' : (stats?.today_appointments?.length ?? 0)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--brown-700)', marginTop: '4px' }}>
            Physio & rehab appointments scheduled
          </div>
        </div>

        <div className="glass-card">
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--brown-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Completed Visits
          </div>
          <div style={{ fontSize: '32px', fontWeight: '800', color: 'var(--brown-900)', marginTop: '8px' }}>
            {isLoading ? '...' : (stats?.completed_count ?? 0)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--brown-700)', marginTop: '4px' }}>
            Out of {stats?.today_appointments?.length ?? 0} scheduled today
          </div>
        </div>

        <div className="glass-card">
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--brown-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Active Treatment Plans
          </div>
          <div style={{ fontSize: '32px', fontWeight: '800', color: 'var(--brown-900)', marginTop: '8px' }}>
            {isLoading ? '...' : (stats?.active_treatments ?? 0)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--brown-700)', marginTop: '4px' }}>
            Ongoing rehab & physical therapy regimens
          </div>
        </div>

        <div className="glass-card">
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--brown-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Pending Payments
          </div>
          <div style={{ fontSize: '32px', fontWeight: '800', color: 'var(--brown-900)', marginTop: '8px' }}>
            {isLoading ? '...' : `${stats?.currency || '₹'}${stats?.pending_payments ?? 0}`}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--brown-700)', marginTop: '4px' }}>
            Outstanding across unpaid & partially paid invoices
          </div>
        </div>
      </div>

      {/* Today's Appointments Section */}
      <div className="glass-card" style={{ marginTop: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--brown-900)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon name="calendar" /> Today's Visits ({stats?.today_appointments?.length ?? 0})
          </h2>
          <Link to="/appointments" className="btn btn-ghost btn-sm">
            View All Schedule &rarr;
          </Link>
        </div>

        {isLoading ? (
          <p style={{ color: 'var(--brown-500)' }}>Loading today's schedule...</p>
        ) : !stats?.today_appointments || stats.today_appointments.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--brown-500)' }}>
            No appointments scheduled for today.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {stats.today_appointments.map((appt) => (
              <div
                key={appt.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                  padding: '16px 20px',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.7)',
                  border: '1px solid var(--glass-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--brown-900)', minWidth: '80px' }}>
                    {appt.time?.substring(0, 5) || '--:--'}
                  </div>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--brown-900)' }}>
                      {appt.pet_name} <span style={{ fontSize: '13px', fontWeight: 'normal', color: 'var(--brown-500)' }}>({appt.pet_type})</span>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--brown-700)' }}>
                      Owner: {appt.owner_name} &bull; Type: {appt.visit_type_display || appt.visit_type}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <span className={`badge badge-${(appt.status || 'confirmed').toLowerCase().replace(/\s+/g, '-')}`}>
                    {humanizeStatus(appt.status)}
                  </span>

                  {appt.status === 'Pending' && (
                    <button
                      disabled={confirmingId === appt.id}
                      onClick={() => handleConfirm(appt.id)}
                      className="btn btn-secondary btn-sm"
                      style={{ background: 'rgba(46, 125, 50, 0.1)', color: '#1b5e20', borderColor: 'rgba(46, 125, 50, 0.25)' }}
                    >
                      <Icon name="check" /> {confirmingId === appt.id ? 'Confirming…' : 'Confirm'}
                    </button>
                  )}

                  {appt.status !== 'Completed' && (
                    <button
                      onClick={() => handleComplete(appt.id)}
                      className="btn btn-secondary btn-sm"
                    >
                      <Icon name="check" /> Complete
                    </button>
                  )}

                  <Link to={`/appointments/${appt.id}/reschedule`} className="btn btn-ghost btn-sm">
                    Reschedule
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
