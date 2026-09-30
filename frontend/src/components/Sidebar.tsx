import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { logout, fetchMe } from '../api/auth';
import { fetchEnquiries, enquiriesQueryKey } from '../api/enquiries';
import { fetchFacilityBookings, facilityQueryKey } from '../api/facility';
import { fetchBoardings, boardingQueryKey, fetchBoardingEndingSoon, boardingEndingSoonQueryKey } from '../api/boarding';
import { useFlash } from '../lib/flash';
import { Icon, IconName } from './Icon';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}

const NAV_BY_ROLE: Record<'DOCTOR' | 'OWNER', NavItem[]> = {
  DOCTOR: [
    { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { to: '/appointments', label: 'Appointments', icon: 'calendar' },
    { to: '/patients', label: 'Patients', icon: 'paw' },
    { to: '/invoices', label: 'Invoices & Billing', icon: 'invoice' },
    { to: '/revenue', label: 'Revenue', icon: 'chart' },
    { to: '/enquiries', label: 'Enquiries', icon: 'mail' },
    { to: '/facility', label: 'Facility Bookings', icon: 'clock' },
    { to: '/boarding', label: 'Boarding', icon: 'list' },
    { to: '/queries', label: 'Messages', icon: 'chat' },
    // Named for what it actually is. The screen looks up one owner by phone and
    // toggles an SMS opt-out flag; there is no notification inbox behind it, and
    // no SMS integration in the codebase at all. Calling it "Notifications"
    // promised a feed that exists in the API but has no screen.
    { to: '/notifications-settings', label: 'SMS Reminders', icon: 'bell' },
    { to: '/profile', label: 'Profile', icon: 'settings' },
  ],
  OWNER: [
    { to: '/owner/home', label: 'My Pets', icon: 'paw' },
    { to: '/owner/bookings', label: 'My Bookings', icon: 'clock' },
    { to: '/owner/appointments', label: 'Appointments', icon: 'calendar' },
    { to: '/owner/billing', label: 'Invoices', icon: 'invoice' },
  ],
};

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const { addFlash } = useFlash();

  // Shares the ['me'] cache with RequireAuth, so this is normally already
  // warm and doesn't trigger an extra request.
  const { data: user } = useQuery({ queryKey: ['me'], queryFn: fetchMe });

  // `|| []` is not redundant despite the closed union on User['role']: the
  // value comes from the API, not the type system. An unexpected role would
  // make this `undefined`, and `.map` below would throw -- from a component
  // rendered OUTSIDE the ErrorBoundary, so it takes the whole shell down
  // rather than showing an in-page recovery.
  const navItems = (user && NAV_BY_ROLE[user.role]) || [];

  // Same query key + fetcher the Enquiries screen uses for its default (NEW)
  // tab, so the two share one cache entry instead of issuing separate
  // requests. Owners never see this nav item and have no `/enquiries`
  // permission, so the query only runs for a signed-in doctor.
  // The three inbox badges poll so a request that arrives from the website
  // while the doctor is sitting on any page bumps the count on its own — the
  // Sidebar never remounts and the app has refetchOnWindowFocus off, so without
  // this the count would only move when the doctor acts on something or reloads.
  // A minute is frequent enough for a booking inbox and cheap (three small GETs);
  // acting on an item still updates instantly via query invalidation.
  const INBOX_POLL_MS = 60_000;

  const { data: enquiriesData } = useQuery({
    queryKey: enquiriesQueryKey('NEW'),
    queryFn: () => fetchEnquiries('NEW'),
    enabled: user?.role === 'DOCTOR',
    refetchInterval: INBOX_POLL_MS,
  });
  const newEnquiryCount = enquiriesData?.new_count ?? 0;

  // Same idea for the two other inboxes a doctor triages — Facility Bookings
  // and Boarding both report how many are still PENDING, shown as the same
  // count badge so none of the three inboxes needs opening to spot new work.
  const { data: facilityData } = useQuery({
    queryKey: facilityQueryKey(),
    queryFn: () => fetchFacilityBookings(),
    enabled: user?.role === 'DOCTOR',
    refetchInterval: INBOX_POLL_MS,
  });
  const pendingFacilityCount = facilityData?.pending_count ?? 0;

  const { data: boardingData } = useQuery({
    queryKey: boardingQueryKey(),
    queryFn: () => fetchBoardings(),
    enabled: user?.role === 'DOCTOR',
    refetchInterval: INBOX_POLL_MS,
  });
  const pendingBoardingCount = boardingData?.pending_count ?? 0;

  // Stays about to end (or overdue) — an urgent, time-sensitive count, polled a
  // little more often than the inbox badges since it moves minute to minute.
  const { data: endingSoonData } = useQuery({
    queryKey: boardingEndingSoonQueryKey(),
    queryFn: () => fetchBoardingEndingSoon(),
    enabled: user?.role === 'DOCTOR',
    refetchInterval: 30_000,
  });
  const endingSoonCount = endingSoonData?.count ?? 0;

  // Per-route badge count, so the nav loop stays a single map.
  const badgeFor = (to: string): number => {
    if (to === '/enquiries') return newEnquiryCount;
    if (to === '/facility') return pendingFacilityCount;
    if (to === '/boarding') return pendingBoardingCount;
    return 0;
  };

  const handleLogout = async () => {
    try {
      await logout();
      addFlash('Logged out successfully', 'info');
      navigate('/login');
    } catch {
      navigate('/login');
    }
  };

  return (
    <aside className="sidebar" id="app-sidebar">
      <div className="sidebar-brand" style={{ paddingBottom: '12px' }}>
        <div style={{ fontSize: '18px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img
            src={`${import.meta.env.BASE_URL}logo.svg`}
            alt=""
            width={28}
            height={28}
            style={{ borderRadius: '50%', display: 'block', flexShrink: 0 }}
          />
          Pet Physio Vet
        </div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {navItems.map((item) => {
          const count = badgeFor(item.to);
          // Boarding carries an extra, urgent red count for stays about to end.
          const urgent = item.to === '/boarding' ? endingSoonCount : 0;
          return (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon name={item.icon} /> {item.label}
              <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '4px' }}>
                {urgent > 0 && (
                  <span
                    className="badge badge-danger"
                    title="Stays ending soon"
                    style={{ fontSize: '10px', padding: '1px 7px' }}
                  >
                    {urgent}
                  </span>
                )}
                {count > 0 && (
                  <span className="badge badge-pending" style={{ fontSize: '10px', padding: '1px 7px' }}>
                    {count}
                  </span>
                )}
              </span>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-spacer" />

      <button onClick={handleLogout} className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', color: '#b71c1c' }}>
        <Icon name="logout" /> Sign Out
      </button>
    </aside>
  );
};
