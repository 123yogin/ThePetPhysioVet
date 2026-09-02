import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMe, updateProfile } from '../api/auth';
import { useFlash } from '../lib/flash';

export const ProfileScreen: React.FC = () => {
  const { addFlash } = useFlash();

  const { data: user, isLoading, isError, refetch } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
  });

  const [firstName, setFirstName] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      setFirstName(user.first_name || '');
      setClinicName(user.clinic_name || '');
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await updateProfile({ first_name: firstName, clinic_name: clinicName });
      addFlash('Profile updated successfully', 'success');
      refetch();
    } catch (err: any) {
      addFlash(err.message || 'Failed to update profile', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h1 className="page-title">Clinic Profile & Settings</h1>
      <p className="page-sub">Doctor details and veterinary clinic branding</p>

      {isError && (
        <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Could not load your profile.</span>
          <button type="button" onClick={() => refetch()} className="btn btn-ghost btn-sm">
            Retry
          </button>
        </div>
      )}

      {isLoading && <p style={{ color: 'var(--brown-500)' }}>Loading profile...</p>}

      <form onSubmit={handleSubmit} className="glass-card">
        <div className="field">
          <label>Doctor Name</label>
          <input
            type="text"
            className="input-glass"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Clinic Name</label>
          <input
            type="text"
            className="input-glass"
            value={clinicName}
            onChange={(e) => setClinicName(e.target.value)}
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Updating...' : 'Save Profile Changes'}
        </button>
      </form>
    </div>
  );
};
