import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { logout, fetchMe } from '../api/auth';
import { fetchEnquiries, enquiriesQueryKey } from '../api/enquiries';
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
  const userName = user
    ? [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username
    : null;

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
  const { data: enquiriesData } = useQuery({
    queryKey: enquiriesQueryKey('NEW'),
    queryFn: () => fetchEnquiries('NEW'),
    enabled: user?.role === 'DOCTOR',
  });
  const newEnquiryCount = enquiriesData?.new_count ?? 0;

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
          <Icon name="paw" size={20} /> Pet Physio Vet
        </div>
        <div style={{ fontSize: '12px', color: 'var(--brown-600)', marginTop: '2px', fontWeight: '600', minHeight: '15px' }}>
          {userName || ' '}
        </div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Icon name={item.icon} /> {item.label}
            {item.to === '/enquiries' && newEnquiryCount > 0 && (
              <span
                className="badge badge-pending"
                style={{ marginLeft: 'auto', fontSize: '10px', padding: '1px 7px' }}
              >
                {newEnquiryCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-spacer" />

      <button onClick={handleLogout} className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', color: '#b71c1c' }}>
        <Icon name="logout" /> Sign Out
      </button>
    </aside>
  );
};
