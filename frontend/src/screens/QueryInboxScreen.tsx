import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchQueryInbox } from '../api/queries';

export const QueryInboxScreen: React.FC = () => {
  const { data: inboxData, isLoading, isError, refetch } = useQuery({
    queryKey: ['queryInbox'],
    queryFn: () => fetchQueryInbox(),
  });

  const threads = inboxData?.results || [];

  return (
    <div>
      <h1 className="page-title">Owner Queries & Messaging</h1>
      <p className="page-sub">Direct patient owner messages, rehab questions, and image attachments</p>

      {isError && (
        <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Could not load query threads.</span>
          <button onClick={() => refetch()} className="btn btn-ghost btn-sm">
            Retry
          </button>
        </div>
      )}

      {isLoading ? (
        <p>Loading messages...</p>
      ) : isError ? null : threads.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ color: 'var(--brown-500)', margin: 0 }}>No active query threads found.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {threads.map((t, i) => (
            <Link
              key={i}
              to={`/patients/${t.pet.id}`}
              className="glass-card"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                textDecoration: 'none',
                color: 'var(--brown-900)',
              }}
            >
              <div>
                <div style={{ fontSize: '18px', fontWeight: '700' }}>
                  🐕 {t.pet.name} <span style={{ fontSize: '14px', fontWeight: 'normal', color: 'var(--brown-500)' }}>({t.pet.owner_name})</span>
                </div>
                <div style={{ fontSize: '14px', color: 'var(--brown-700)', marginTop: '4px' }}>
                  {t.last_message?.snippet || 'New query thread'}
                </div>
              </div>
              <div>
                <span className="btn btn-secondary btn-sm">Reply in Clinical Profile &rarr;</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
