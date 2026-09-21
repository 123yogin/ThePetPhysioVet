import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchFacilityBookings,
  updateFacilityBookingStatus,
  facilityQueryKey,
  FacilityBookingGroup,
} from '../api/facility';
import { useFlash } from '../lib/flash';
import { Icon } from '../components/Icon';
import { friendlyDate } from '../lib/labels';

/**
 * Day-care slot bookings the website has taken.
 *
 * One card per visitor request (the API groups the 1-3 slots that share a
 * reference), filterable by status. Confirm and cancel act on the whole
 * booking; cancelling frees the beds server-side the instant the status flips,
 * so the public availability count corrects itself with no extra call here.
 */

type StatusTab = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'ALL';

const TABS: { key: StatusTab; label: string }[] = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'CANCELLED', label: 'Cancelled' },
  { key: 'ALL', label: 'All' },
];

const BADGE_CLASS: Record<string, string> = {
  PENDING: 'badge-pending',
  CONFIRMED: 'badge-confirmed',
  CANCELLED: 'badge-cancelled',
  COMPLETED: 'badge-confirmed',
};

export const FacilityBookingsScreen: React.FC = () => {
  const qc = useQueryClient();
  const { addFlash } = useFlash();
  const [tab, setTab] = useState<StatusTab>('PENDING');

  const statusParam = tab === 'ALL' ? undefined : tab;
  const { data, isLoading, isError } = useQuery({
    queryKey: facilityQueryKey(undefined, statusParam),
    queryFn: () => fetchFacilityBookings(undefined, statusParam),
  });

  const mutation = useMutation({
    mutationFn: ({ reference, status }: { reference: string; status: 'CONFIRMED' | 'CANCELLED' }) =>
      updateFacilityBookingStatus(reference, status),
    onSuccess: (_res, vars) => {
      // Every facility list is now stale — availability and counts changed.
      qc.invalidateQueries({ queryKey: ['facility-bookings'] });
      addFlash(
        vars.status === 'CONFIRMED' ? 'Booking confirmed.' : 'Booking cancelled — beds freed.',
        'success',
      );
    },
    onError: () => addFlash('Could not update the booking. Please try again.', 'error'),
  });

  const groups: FacilityBookingGroup[] = data?.results ?? [];

  return (
    <div>
      <h1 className="page-title">Facility Bookings</h1>
      <p className="page-sub">
        Indoor-facility slot bookings from the website — six beds per hour, 9:30 AM to 1:30 PM
      </p>

      {/* Status tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '20px',
          borderBottom: '2px solid var(--glass-border)',
          paddingBottom: '12px',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`btn ${tab === t.key ? 'btn-primary' : 'btn-ghost'}`}
            aria-current={tab === t.key ? 'true' : undefined}
          >
            {t.label}
            {t.key === 'PENDING' && data?.pending_count ? ` (${data.pending_count})` : ''}
          </button>
        ))}
      </div>

      {isLoading && <p className="page-sub">Loading…</p>}
      {isError && (
        <div className="alert alert-danger">Could not load bookings. Please refresh.</div>
      )}

      {!isLoading && !isError && groups.length === 0 && (
        <div className="glass-card" style={{ textAlign: 'center', padding: '40px' }}>
          <Icon name="clock" size={28} />
          <p className="page-sub" style={{ marginTop: '10px' }}>
            {tab === 'PENDING'
              ? 'No bookings waiting. New requests from the website will appear here.'
              : 'Nothing here.'}
          </p>
        </div>
      )}

      {/* A responsive grid rather than one full-width row per booking. A single
          booking on a wide desktop looked like a stretched banner -- content on
          the far left, the date stranded on the far right, empty in between.
          Cards ~360-460px wide read as cards and tile neatly as more come in. */}
      <div
        style={{
          display: 'grid',
          gap: '16px',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 460px))',
        }}
      >
        {groups.map((g) => {
          const busy = mutation.isPending && mutation.variables?.reference === g.reference;
          const actionable = g.status === 'PENDING' || g.status === 'CONFIRMED';
          return (
            <div
              key={g.reference}
              className="glass-card"
              style={{
                padding: '18px',
                borderLeft: '4px solid var(--primary)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              {/* Header: pet + status on the left, date + reference stacked on
                  the right, so the two meta items sit together instead of the
                  reference floating loose next to the badge. */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '1.05rem' }}>{g.pet_name}</strong>
                    <span className={`badge ${BADGE_CLASS[g.status] ?? 'badge-pending'}`}>{g.status}</span>
                  </div>
                  <p className="page-sub" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
                    {g.owner_name}
                    <br />
                    <a href={`tel:${g.owner_phone}`}>{g.owner_phone}</a>
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{friendlyDate(g.date)}</div>
                  <div className="page-sub" style={{ fontSize: '0.72rem', letterSpacing: '0.04em', marginTop: '2px' }}>
                    {g.reference}
                  </div>
                </div>
              </div>

              {/* The slots this booking holds, led by a count so the card says
                  at a glance how many of the (max three) slots were taken. */}
              <div>
                <div className="page-sub" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '6px' }}>
                  {g.slots.length} slot{g.slots.length > 1 ? 's' : ''} held
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {g.slots.map((s) => (
                    <span
                      key={s.slot}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '3px 9px',
                        background: 'var(--glass-bg, rgba(0,0,0,0.03))',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '999px',
                        fontSize: '0.8rem',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <Icon name="clock" size={12} /> {s.label}
                    </span>
                  ))}
                </div>
              </div>

              {g.note && (
                <p className="page-sub" style={{ margin: 0, fontStyle: 'italic', fontSize: '0.85rem' }}>
                  “{g.note}”
                </p>
              )}

              {actionable && (
                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    marginTop: 'auto',
                    paddingTop: '4px',
                    borderTop: '1px solid var(--glass-border)',
                  }}
                >
                  {g.status === 'PENDING' && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busy}
                      onClick={() => mutation.mutate({ reference: g.reference, status: 'CONFIRMED' })}
                      style={{ marginTop: '10px' }}
                    >
                      <Icon name="check" size={14} /> Confirm
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() => mutation.mutate({ reference: g.reference, status: 'CANCELLED' })}
                    style={{ marginTop: '10px' }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
