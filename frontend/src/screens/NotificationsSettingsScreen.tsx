import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchNotificationPrefs, updateNotificationPrefs } from '../api/notifications';
import { fetchSmsLog, sendTestSms, type SmsMode, type SmsStatus } from '../api/sms';
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

      <SmsActivity />
    </div>
  );
};

const MODE_LABEL: Record<SmsMode, string> = {
  android_gateway: 'Android gateway (live)',
  console: 'Console (not sent, log only)',
  disabled: 'Disabled (not sent)',
};

const KIND_LABEL: Record<string, string> = {
  appointment_confirmed: 'Appointment confirmed',
  appointment_moved: 'Appointment moved',
  appointment_reminder: 'Appointment reminder',
  boarding_confirmed: 'Boarding confirmed',
  boarding_checkout: 'Check-out reminder',
  test: 'Test',
};

const STATUS_BADGE: Record<SmsStatus, string> = {
  QUEUED: 'badge-pending',
  SENT: 'badge-confirmed',
  DELIVERED: 'badge-success',
  FAILED: 'badge-failed',
  SKIPPED_OPTOUT: 'badge-neutral',
  SKIPPED_LIMIT: 'badge-warning',
  SKIPPED_COUNTRY: 'badge-neutral',
  SKIPPED_DISABLED: 'badge-neutral',
};

const STATUS_LABEL: Record<SmsStatus, string> = {
  QUEUED: 'Queued',
  SENT: 'Sent',
  DELIVERED: 'Delivered',
  FAILED: 'Failed',
  SKIPPED_OPTOUT: 'Opted out',
  SKIPPED_LIMIT: 'Daily limit',
  SKIPPED_COUNTRY: 'Country blocked',
  SKIPPED_DISABLED: 'SMS off',
};

const PAGE_SIZE = 20;

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

const SmsActivity: React.FC = () => {
  const [page, setPage] = useState(1);
  const [testTo, setTestTo] = useState('');
  const { addFlash } = useFlash();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['smsLog', page],
    queryFn: () => fetchSmsLog(page, PAGE_SIZE),
  });

  const testMutation = useMutation({
    mutationFn: (to: string) => sendTestSms(to),
    onSuccess: (msg) => {
      if (msg.provider === 'console' && msg.status === 'SENT') {
        addFlash(`Test SMS logged on the server for ${msg.to} (console mode: nothing was sent)`, 'success');
      } else if (msg.status === 'SENT' || msg.status === 'DELIVERED') {
        addFlash(`Test SMS handed to the gateway for ${msg.to}`, 'success');
      } else {
        addFlash(`Test SMS not sent: ${STATUS_LABEL[msg.status]}${msg.error ? ` (${msg.error})` : ''}`, 'error');
      }
      setPage(1);
      queryClient.invalidateQueries({ queryKey: ['smsLog'] });
    },
    onError: (err: any) => addFlash(err.message || 'Could not send the test SMS', 'error'),
  });

  const handleTest = (e: React.FormEvent) => {
    e.preventDefault();
    const to = testTo.trim();
    if (!to) {
      addFlash('Enter a phone number for the test SMS', 'error');
      return;
    }
    testMutation.mutate(to);
  };

  const pages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;
  const atLimit = !!data && data.sent_today >= data.daily_limit;

  return (
    <>
      <div className="glass-card" style={{ marginTop: '24px' }}>
        <h2 style={{ fontSize: '18px', margin: '0 0 12px' }}>SMS gateway</h2>
        {data && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', fontSize: '14px', marginBottom: '16px' }}>
            <span>
              Mode: <strong>{MODE_LABEL[data.mode] ?? data.mode}</strong>
            </span>
            <span>
              Sent today: <strong>{data.sent_today} / {data.daily_limit}</strong>
              {atLimit && <span className="badge badge-warning" style={{ marginLeft: '8px' }}>Limit reached</span>}
            </span>
          </div>
        )}
        <form onSubmit={handleTest} className="field" style={{ margin: 0 }}>
          <label htmlFor="testSmsTo">Send test SMS</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              id="testSmsTo"
              type="tel"
              className="input-glass"
              style={{ flex: '1 1 200px', minWidth: 0 }}
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="e.g. +91 98765 43210"
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={testMutation.isPending}>
              {testMutation.isPending ? 'Sending...' : 'Send test SMS'}
            </button>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--brown-500)', margin: '6px 0 0' }}>
            Counts toward today&apos;s limit.
          </p>
        </form>
      </div>

      <div className="glass-card" style={{ marginTop: '24px' }}>
        <h2 style={{ fontSize: '18px', margin: '0 0 12px' }}>Recent SMS</h2>
        {isLoading && <p style={{ margin: 0 }}>Loading...</p>}
        {isError && (
          <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <span>{(error as Error)?.message || 'Could not load the SMS log.'}</span>
            <button type="button" onClick={() => refetch()} className="btn btn-ghost btn-sm">Retry</button>
          </div>
        )}
        {data && data.results.length === 0 && (
          <p style={{ color: 'var(--brown-500)', margin: 0 }}>No SMS sent yet.</p>
        )}
        {data && data.results.length > 0 && (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Phone</th>
                    <th>Kind</th>
                    <th>Status</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((m) => (
                    <tr key={m.id}>
                      <td data-label="Time">{formatWhen(m.created_at)}</td>
                      <td data-label="Phone" style={{ fontVariantNumeric: 'tabular-nums' }}>{m.to}</td>
                      <td data-label="Kind">{KIND_LABEL[m.kind] ?? m.kind}</td>
                      <td data-label="Status">
                        <span className={`badge ${STATUS_BADGE[m.status] ?? 'badge-neutral'}`}>
                          {STATUS_LABEL[m.status] ?? m.status}
                        </span>
                      </td>
                      <td data-label="Error" style={{ fontSize: '13px', overflowWrap: 'anywhere' }}>{m.error || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </button>
                <span style={{ fontSize: '13px' }}>Page {page} of {pages}</span>
                <button type="button" className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
};
