import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchOwnerBookings } from '../api/owner';
import { Icon } from '../components/Icon';
import { friendlyDate } from '../lib/labels';

/**
 * "My Bookings" — the owner's own view of everything they booked with the
 * clinic: Physiotherapy slots, Swimming/Grooming/Walking requests, and boarding
 * stays, matched to this account by phone. Read-only — it mirrors the clinic's
 * inboxes so a booking stops being a black box until the clinic calls.
 *
 * This screen deliberately does NOT open the public marketing site's booking
 * flow — the app and the website are kept separate. An owner books through the
 * app's own "Book Appointment" on My Pets.
 */

const rupee = (n: number) => `₹${n.toLocaleString('en-IN')}`;

// The owner does not think in HELD / NEW / CONVERTED — say what each means for
// them, and pick a badge colour that reads at a glance.
const STATUS_LABEL: Record<string, string> = {
  NEW: 'Received',
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  CHECKED_IN: 'Checked in',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  CONVERTED: 'Booked',
  DISMISSED: 'Closed',
};
const STATUS_BADGE: Record<string, string> = {
  NEW: 'badge-info',
  PENDING: 'badge-pending',
  CONFIRMED: 'badge-confirmed',
  CHECKED_IN: 'badge-active',
  COMPLETED: 'badge-completed',
  CANCELLED: 'badge-cancelled',
  CONVERTED: 'badge-success',
  DISMISSED: 'badge-neutral',
};
const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <span className={`badge ${STATUS_BADGE[status] || 'badge-neutral'}`}>
    {STATUS_LABEL[status] || status}
  </span>
);

const Section: React.FC<{ title: string; icon: any; count: number; children: React.ReactNode }> = ({
  title,
  icon,
  count,
  children,
}) => (
  <section style={{ marginBottom: '28px' }}>
    <h2 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--brown-900)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
      <Icon name={icon} size={16} /> {title}
      <span className="badge badge-neutral" style={{ fontSize: '10px' }}>{count}</span>
    </h2>
    {count === 0 ? (
      <p className="page-sub" style={{ fontSize: '13px', margin: 0 }}>Nothing here yet.</p>
    ) : (
      <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {children}
      </div>
    )}
  </section>
);

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="glass-card" style={{ padding: '16px', borderLeft: '4px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
    {children}
  </div>
);

export const OwnerBookingsScreen: React.FC = () => {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ownerBookings'],
    queryFn: fetchOwnerBookings,
    // Same idea as the clinic's inbox badges: the clinic may confirm or check a
    // booking in while the owner has this page open, so keep it fresh.
    refetchInterval: 60_000,
  });

  const total =
    (data?.facility.length ?? 0) + (data?.requests.length ?? 0) + (data?.boarding.length ?? 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="page-title">My Bookings</h1>
          <p className="page-sub">Everything you&rsquo;ve booked with us and where it stands</p>
        </div>
        <Link to="/owner/home?book=1" className="btn btn-primary btn-sm">
          <Icon name="calendar" /> Book appointment
        </Link>
      </div>

      {isLoading ? (
        <p className="page-sub">Loading your bookings…</p>
      ) : isError ? (
        <p className="page-sub">
          Couldn&rsquo;t load your bookings.{' '}
          <button type="button" className="table-link" onClick={() => refetch()}>Try again</button>
        </p>
      ) : total === 0 ? (
        <div className="glass-card" style={{ padding: '28px', textAlign: 'center' }}>
          <p style={{ fontWeight: 700, color: 'var(--brown-900)', marginBottom: '6px' }}>No bookings yet</p>
          <p className="page-sub" style={{ marginBottom: '16px' }}>
            Once you book with the clinic, your appointments and stays will show up here.
          </p>
          <Link to="/owner/home?book=1" className="btn btn-primary btn-sm">
            <Icon name="calendar" /> Book appointment
          </Link>
        </div>
      ) : (
        <>
          <Section title="Physiotherapy" icon="activity" count={data!.facility.length}>
            {data!.facility.map((f) => (
              <Card key={f.reference}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <strong>{f.pet_name || 'Your pet'}</strong>
                  <StatusBadge status={f.status} />
                </div>
                <div style={{ fontSize: '13px', color: 'var(--brown-800)' }}>
                  <Icon name="clock" size={12} /> {friendlyDate(f.date)} · {f.slots.join(', ')}
                </div>
                <div className="page-sub" style={{ fontSize: '11px' }}>{f.reference}</div>
              </Card>
            ))}
          </Section>

          <Section title="Service requests" icon="paw" count={data!.requests.length}>
            {data!.requests.map((r) => (
              <Card key={r.reference}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <strong>{r.pet_name || 'Your pet'}</strong>
                  <StatusBadge status={r.status} />
                </div>
                <div style={{ fontSize: '13px', color: 'var(--brown-800)', lineHeight: 1.5 }}>{r.reason}</div>
                <div className="page-sub" style={{ fontSize: '11px' }}>{r.reference}</div>
              </Card>
            ))}
          </Section>

          <Section title="Boarding stays" icon="list" count={data!.boarding.length}>
            {data!.boarding.map((b) => (
              <Card key={b.reference}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <strong>{b.pet_name || 'Your pet'}</strong>
                  <StatusBadge status={b.status} />
                </div>
                <div style={{ fontSize: '13px', color: 'var(--brown-800)' }}>
                  <Icon name="clock" size={12} /> {friendlyDate(b.check_in)}
                  {b.check_out !== b.check_in ? ` → ${friendlyDate(b.check_out)}` : ''} · {b.duration_label}
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--primary)' }}>{rupee(b.price)}</div>
                {b.walk_times.length > 0 && (
                  <div className="page-sub" style={{ fontSize: '12px' }}>Walks: {b.walk_times.join(', ')}</div>
                )}
                <div className="page-sub" style={{ fontSize: '11px' }}>{b.reference}</div>
              </Card>
            ))}
          </Section>
        </>
      )}
    </div>
  );
};
