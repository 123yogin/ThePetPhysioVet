import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchNotificationPrefs, updateNotificationPrefs } from '../api/notifications';
import { useFlash } from '../lib/flash';

export const NotificationsSettingsScreen: React.FC = () => {
  const [phone, setPhone] = useState('');
  const [optOut, setOptOut] = useState(false);
  const { addFlash } = useFlash();

  const { isError, isFetching, refetch } = useQuery({
    queryKey: ['notifPrefs', phone],
    queryFn: async () => {
      const res = await fetchNotificationPrefs(phone);
      if (res && typeof res.sms_opt_out === 'boolean') {
        setOptOut(res.sms_opt_out);
      }
      return res;
    },
    enabled: !!phone,
  });

  const handleLookup = () => {
    if (!phone.trim()) {
      addFlash('Enter an owner phone number to look up their preference', 'error');
      return;
    }
    refetch();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      addFlash('Please enter an owner phone number', 'error');
      return;
    }
    try {
      await updateNotificationPrefs({ owner_phone: phone, sms_opt_out: optOut });
      addFlash('Notification preferences updated', 'success');
      refetch();
    } catch (err: any) {
      addFlash(err.message || 'Failed to update preferences', 'error');
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h1 className="page-title">Notification Settings</h1>
      <p className="page-sub">SMS & WhatsApp reminder settings for patient owners</p>

      {isError && (
        <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Could not load existing preferences for this number. You can still save new preferences below.</span>
          <button type="button" onClick={() => refetch()} className="btn btn-ghost btn-sm">
            Retry
          </button>
        </div>
      )}

      <form onSubmit={handleSave} className="glass-card">
        <div className="field">
          <label>Owner Phone Number</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="tel"
              className="input-glass"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +91 98765 43210"
              required
            />
            <button type="button" onClick={handleLookup} className="btn btn-ghost btn-sm" disabled={isFetching}>
              {isFetching ? 'Looking up...' : 'Look Up'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0' }}>
          <input
            type="checkbox"
            id="optOut"
            checked={optOut}
            onChange={(e) => setOptOut(e.target.checked)}
            style={{ width: '20px', height: '20px', cursor: 'pointer' }}
          />
          <label htmlFor="optOut" style={{ fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }}>
            Opt-out owner from automated SMS appointment reminders
          </label>
        </div>

        <button type="submit" className="btn btn-primary">
          Save Notification Preference
        </button>
      </form>
    </div>
  );
};
