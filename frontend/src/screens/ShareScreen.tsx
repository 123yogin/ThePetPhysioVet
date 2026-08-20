import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchShareAppointment } from '../api/appointments';

export const ShareScreen: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const apptId = Number(id);

  const { data: shareData, isLoading, isError, refetch } = useQuery({
    queryKey: ['shareAppointment', apptId],
    queryFn: () => fetchShareAppointment(apptId),
    enabled: !!apptId,
  });

  if (isLoading) return <p>Generating share links...</p>;

  if (isError) {
    return (
      <div style={{ maxWidth: '540px', margin: '0 auto' }}>
        <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Could not generate share links for this appointment.</span>
          <button onClick={() => refetch()} className="btn btn-ghost btn-sm">
            Retry
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '16px' }}>
          <Link to="/appointments" className="btn btn-ghost btn-sm">
            Go to Schedule
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '540px', margin: '0 auto', textAlign: 'center' }}>
      <div className="glass-card" style={{ padding: '36px 24px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
        <h1 className="page-title" style={{ marginBottom: '8px' }}>Appointment Confirmed!</h1>
        <p className="page-sub" style={{ marginBottom: '24px' }}>
          Session booked for <strong>{shareData?.pet_name}</strong> (Owner: {shareData?.owner_name})
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
          {shareData?.whatsapp_url && (
            <a
              href={shareData.whatsapp_url}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary"
              style={{ background: '#25D366', borderColor: '#25D366' }}
            >
              💬 Share via WhatsApp
            </a>
          )}
          {shareData?.sms_url && (
            <a
              href={shareData.sms_url}
              className="btn btn-secondary"
            >
              📱 Send SMS Confirmation
            </a>
          )}
          {!shareData?.whatsapp_url && !shareData?.sms_url && (
            <p style={{ color: 'var(--brown-500)', margin: 0 }}>No share links are available for this appointment.</p>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
          <Link to="/appointments" className="btn btn-ghost btn-sm">
            Go to Schedule
          </Link>
          <Link to="/dashboard" className="btn btn-ghost btn-sm">
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
};
