import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { logout, fetchMe } from '../api/auth';
import { useFlash } from '../lib/flash';

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const { addFlash } = useFlash();

  // Shares the ['me'] cache with RequireAuth, so this is normally already
  // warm and doesn't trigger an extra request.
  const { data: user } = useQuery({ queryKey: ['me'], queryFn: fetchMe });
  const doctorName = user
    ? [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username
    : null;

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
    <aside className="sidebar">
      <div className="sidebar-brand" style={{ paddingBottom: '12px' }}>
        <div style={{ fontSize: '18px', fontWeight: '800' }}>🐾 Pet Physio Vet</div>
        <div style={{ fontSize: '12px', color: 'var(--brown-600)', marginTop: '2px', fontWeight: '600' }}>
          {doctorName || 'Loading...'}
        </div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <NavLink to="/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="icon">📊</span> Dashboard
        </NavLink>
        <NavLink to="/appointments" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="icon">📅</span> Appointments
        </NavLink>
        <NavLink to="/patients" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="icon">🐕</span> Patients
        </NavLink>
        <NavLink to="/invoices" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="icon">🧾</span> Invoices & Billing
        </NavLink>
        <NavLink to="/revenue" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="icon">📈</span> Revenue
        </NavLink>
        <NavLink to="/queries" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="icon">💬</span> Queries / Inbox
        </NavLink>
        <NavLink to="/notifications-settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="icon">🔔</span> Notifications
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="icon">⚙️</span> Profile
        </NavLink>
      </nav>

      <div className="sidebar-spacer" />

      <button onClick={handleLogout} className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', color: '#b71c1c' }}>
        🚪 Sign Out
      </button>
    </aside>
  );
};
