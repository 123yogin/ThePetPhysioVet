import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchNotificationPrefs, updateNotificationPrefs } from '../api/notifications';
import { useFlash } from '../lib/flash';

export const NotificationsSettingsScreen: React.FC = () => {
  const [phone, setPhone] = useState('');
  // The number a lookup was actually asked for, which is NOT what is in the
  // box. This used to key the query on `phone` itself, and since the key
  // changes on every keystroke, TanStack refetched on every keystroke -- the
  // "Look Up" button was decorative, because the lookup had already happened
  // one character at a time. Typing a ten-digit number sent ten requests, and
  // the API answered each with `get_or_create`, so a single lookup left ten
  // rows in production keyed on "9", "98", "980" ... Only an explicit Look Up
  // moves this now, so one lookup is one request.
  const [lookupPhone, setLookupPhone] = useState('');
  const [optOut, setOptOut] = useState(false);
  const { addFlash } = useFlash();

  const { isError, error, isFetching, refetch } = useQuery({
    queryKey: ['notifPrefs', lookupPhone],
    queryFn: async () => {
      const res = await fetchNotificationPrefs(lookupPhone);
      if (res && typeof res.sms_opt_out === 'boolean') {
        setOptOut(res.sms_opt_out);
      }
      return res;
    },
    enabled: !!lookupPhone,
  });

  const handleLookup = () => {
    const next = phone.trim();
    if (!next) {
      addFlash('Enter an owner phone number to look up their preference', 'error');
      return;
    }
    // Re-pressing Look Up on an unchanged number leaves the key alone, so ask
    // for the refetch explicitly rather than silently doing nothing.
    if (next === lookupPhone) {
      refetch();
    } else {
      setLookupPhone(next);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      addFlash('Please enter an owner phone number', 'error');
      return;
    }
    try {
      await updateNotificationPrefs({ owner_phone: phone.trim(), sms_opt_out: optOut });
      addFlash('Notification preferences updated', 'success');
      setLookupPhone(phone.trim());
    } catch (err: any) {
      addFlash(err.message || 'Failed to update preferences', 'error');
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h1 className="page-title">Notification Settings</h1>
      <p className="page-sub">SMS & WhatsApp reminder settings for patient owners</p>

      {/* Show what the server actually said. This used to be the fixed sentence
          "Could not load existing preferences for this number. You can still
          save new preferences below." -- an assurance that is false when the
          lookup failed because the number is not a phone number, since saving
          it is rejected too. The API's problem detail is already a written
          sentence, so it reads better than the guess did. */}
      {isError && (
        <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <span>{(error as Error)?.message || 'Could not load existing preferences for this number.'}</span>
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
