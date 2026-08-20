import React from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../api/auth';
import { FlashStack } from './FlashStack';
import { ErrorBoundary } from './ErrorBoundary';
import { Icon } from './Icon';

export const OwnerShell: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--brown-50)' }}>
      <FlashStack />
      <header style={{
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--glass-border)',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--brown-900)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon name="paw" size={20} /> Pet Physio Owner Portal
          </div>
          <div style={{ fontSize: '12px', color: 'var(--brown-600)', fontWeight: '500' }}>
            Attending Specialist: <strong>your vet</strong>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <NavLink to="/owner/home" className={({ isActive }) => isActive ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}>
            My Pets
          </NavLink>
          <NavLink to="/owner/appointments" className={({ isActive }) => isActive ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}>
            Appointments
          </NavLink>
          <NavLink to="/owner/billing" className={({ isActive }) => isActive ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}>
            Invoices
          </NavLink>

          <button onClick={handleLogout} className="btn btn-ghost btn-sm" style={{ color: '#b71c1c' }}>
            Logout
          </button>
        </div>
      </header>

      <main style={{ maxWidth: '1000px', margin: '32px auto', padding: '0 20px' }}>
        <ErrorBoundary key={location.pathname} fullPage={false}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
};
