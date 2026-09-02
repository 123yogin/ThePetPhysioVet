import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchEnquiries, convertEnquiry, dismissEnquiry, enquiriesQueryKey } from '../api/enquiries';
import { fetchAppointmentOptions } from '../api/appointments';
import { useFlash } from '../lib/flash';
import { Icon } from '../components/Icon';
import { humanizeStatus, friendlyDate } from '../lib/labels';
import { Enquiry } from '../lib/types';

type StatusTab = 'NEW' | 'CONVERTED' | 'DISMISSED';

const TABS: { key: StatusTab; label: string }[] = [
  { key: 'NEW', label: 'New' },
  { key: 'CONVERTED', label: 'Converted' },
  { key: 'DISMISSED', label: 'Dismissed' },
];

// Same three semantic colours every other status badge on this app uses —
// blue for "awaiting a decision", green for "done", red for "closed out
// without booking". A NEW and a CONVERTED enquiry must never look alike.
const BADGE_CLASS: Record<string, string> = {
  NEW: 'badge-pending',
  CONVERTED: 'badge-confirmed',
  DISMISSED: 'badge-cancelled',
};

const BORDER_COLOR: Record<string, string> = {
  NEW: '#0d47a1',
  CONVERTED: 'var(--primary)',
  DISMISSED: '#b71c1c',
};

const EMPTY_COPY: Record<StatusTab, string> = {
  NEW: "You're all caught up — no new enquiries from the site right now.",
  CONVERTED: 'Nothing converted yet. Booked enquiries will show up here.',
  DISMISSED: 'Nothing dismissed. Enquiries you turn away will show up here.',
};

/** "2026-09-02T14:05:00Z" -> "2:05 PM", without ever printing raw ISO. */
function friendlyClock(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export const EnquiriesScreen: React.FC = () => {
  const { addFlash } = useFlash();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<StatusTab>('NEW');

  const [openConvertId, setOpenConvertId] = useState<string | null>(null);
  const [convertDate, setConvertDate] = useState('');
  const [convertTime, setConvertTime] = useState('10:00');
  const [convertVisitType, setConvertVisitType] = useState('');

  const [confirmDismissId, setConfirmDismissId] = useState<string | null>(null);

  const [justConverted, setJustConverted] = useState<{
    petName: string;
    appointmentId: string;
    date?: string;
    time?: string;
  } | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: enquiriesQueryKey(statusFilter),
    queryFn: () => fetchEnquiries(statusFilter),
  });

  // Single source of truth for bookable visit types — never hardcode this
  // list, three forms once each invented their own and every option 400'd.
  const {
    data: apptOptions,
    isLoading: optionsLoading,
    isError: optionsError,
    refetch: refetchOptions,
  } = useQuery({
    queryKey: ['appointmentOptions'],
    queryFn: fetchAppointmentOptions,
  });
  const visitTypes = apptOptions?.visit_types ?? [];

  useEffect(() => {
    if (!convertVisitType && visitTypes.length > 0) {
      setConvertVisitType(visitTypes[0].value);
    }
  }, [visitTypes, convertVisitType]);

  const enquiries = data?.results ?? [];
  const sorted = [...enquiries].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  const switchTab = (tab: StatusTab) => {
    setStatusFilter(tab);
    setOpenConvertId(null);
    setConfirmDismissId(null);
  };

  const openConvertForm = (enq: Enquiry) => {
    setConfirmDismissId(null);
    setOpenConvertId(enq.id);
    setConvertDate(enq.preferred_date || new Date().toISOString().slice(0, 10));
    setConvertTime('10:00');
    setConvertVisitType(visitTypes[0]?.value || '');
  };

  const convertMutation = useMutation({
    mutationFn: (vars: { id: string; date: string; time: string; visit_type: string }) =>
      convertEnquiry(vars.id, { date: vars.date, time: vars.time, visit_type: vars.visit_type }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['enquiries'] });
      setOpenConvertId(null);
      const appointmentId = updated.appointment?.id || updated.converted_appointment_id || '';
      setJustConverted({
        petName: updated.pet_name,
        appointmentId,
        date: updated.appointment?.date,
        time: updated.appointment?.time,
      });
      addFlash(`Converted — booked an appointment for ${updated.pet_name}.`, 'success');
    },
    onError: (err: any) => {
      addFlash(err?.message || 'Could not convert this enquiry. Please try again.', 'error');
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => dismissEnquiry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enquiries'] });
      setConfirmDismissId(null);
      addFlash('Enquiry dismissed.', 'info');
    },
    onError: (err: any) => {
      addFlash(err?.message || 'Could not dismiss this enquiry. Please try again.', 'error');
    },
  });

  const handleConvertSubmit = (e: React.FormEvent, enq: Enquiry) => {
    e.preventDefault();
    if (!convertDate || !convertTime || !convertVisitType) {
      addFlash('Date, time and visit type are all required to book.', 'error');
      return;
    }
    convertMutation.mutate({ id: enq.id, date: convertDate, time: convertTime, visit_type: convertVisitType });
  };

  const anyMutationPending = convertMutation.isPending || dismissMutation.isPending;

  return (
    <div>
      <h1 className="page-title">Enquiries</h1>
      <p className="page-sub">Booking requests from the website, waiting to be reviewed</p>

      {justConverted && (
        <div
          className="alert alert-success"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}
        >
          <span>
            <Icon name="celebrate" size={14} /> Booked an appointment for <strong>{justConverted.petName}</strong>
            {justConverted.date ? ` on ${friendlyDate(justConverted.date)}` : ''}.
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            {justConverted.appointmentId && (
              <Link to={`/appointments/${justConverted.appointmentId}/share`} className="btn btn-primary btn-sm">
                View Appointment <Icon name="arrowRight" size={14} />
              </Link>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setJustConverted(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

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
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => switchTab(tab.key)}
            className={`btn ${statusFilter === tab.key ? 'btn-primary' : 'btn-ghost'}`}
            aria-current={statusFilter === tab.key ? 'true' : undefined}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isError && (
        <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Could not load enquiries{error instanceof Error && error.message ? `: ${error.message}` : '.'}</span>
          <button onClick={() => refetch()} className="btn btn-ghost btn-sm">
            Retry
          </button>
        </div>
      )}

      {isLoading ? (
        <p style={{ color: 'var(--brown-500)' }}>Loading enquiries...</p>
      ) : isError ? null : sorted.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ color: 'var(--brown-500)', margin: 0 }}>{EMPTY_COPY[statusFilter]}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {sorted.map((enq) => {
            const fullName = [enq.first_name, enq.last_name].filter(Boolean).join(' ') || 'Unknown';
            const isNew = enq.status === 'NEW';
            const isConverted = enq.status === 'CONVERTED';
            const appointmentId = enq.appointment?.id || enq.converted_appointment_id || '';

            return (
              <div
                key={enq.id}
                className="glass-card"
                style={{ padding: '20px', borderLeft: `5px solid ${BORDER_COLOR[enq.status] || 'var(--brown-500)'}` }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
                      <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--brown-900)' }}>{fullName}</span>
                      <span className={`badge ${BADGE_CLASS[enq.status] || 'badge-neutral'}`}>{humanizeStatus(enq.status)}</span>
                    </div>

                    <div style={{ fontSize: '14px', color: 'var(--brown-800)', fontWeight: '600' }}>
                      <Icon name="paw" size={14} /> {enq.pet_name}
                      {enq.species_breed ? ` — ${enq.species_breed}` : ''}
                    </div>

                    {enq.reason && (
                      <div style={{ fontSize: '13px', color: 'var(--brown-700)', marginTop: '6px', maxWidth: '520px' }}>
                        &ldquo;{enq.reason}&rdquo;
                      </div>
                    )}

                    <div style={{ fontSize: '12px', color: 'var(--brown-500)', marginTop: '8px', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                      {enq.phone && (
                        <span>
                          <Icon name="phone" size={12} /> {enq.phone}
                        </span>
                      )}
                      {enq.email && (
                        <span>
                          <Icon name="mail" size={12} /> {enq.email}
                        </span>
                      )}
                      {enq.preferred_specialist && (
                        <span>
                          <Icon name="doctor" size={12} /> Prefers {enq.preferred_specialist}
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--brown-500)', marginTop: '4px', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                      <span>
                        <Icon name="clock" size={12} /> Submitted {friendlyDate(enq.created_at)}
                        {friendlyClock(enq.created_at) ? ` at ${friendlyClock(enq.created_at)}` : ''}
                      </span>
                      {enq.preferred_date && (
                        <span>
                          <Icon name="calendar" size={12} /> Preferred {friendlyDate(enq.preferred_date)}
                        </span>
                      )}
                    </div>

                    {isConverted && (
                      <div
                        style={{
                          marginTop: '12px',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: 'rgba(46, 125, 50, 0.1)',
                          border: '1px solid rgba(46, 125, 50, 0.25)',
                          fontSize: '13px',
                          color: '#1b5e20',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <Icon name="check" size={14} />
                        Booked{enq.appointment?.date ? ` for ${friendlyDate(enq.appointment.date)}` : ''}.
                        {appointmentId && (
                          <Link to={`/appointments/${appointmentId}/share`} className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}>
                            View Appointment <Icon name="arrowRight" size={14} />
                          </Link>
                        )}
                      </div>
                    )}

                    {confirmDismissId === enq.id && (
                      <div
                        style={{
                          marginTop: '12px',
                          padding: '12px 16px',
                          borderRadius: '8px',
                          background: 'rgba(198, 40, 40, 0.1)',
                          border: '1px solid rgba(198, 40, 40, 0.25)',
                          fontSize: '13px',
                          color: '#b71c1c',
                        }}
                      >
                        <div style={{ marginBottom: '8px' }}>Dismiss this enquiry? It won't be converted into an appointment.</div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => dismissMutation.mutate(enq.id)}
                            className="btn btn-sm"
                            disabled={dismissMutation.isPending}
                            style={{ background: '#b71c1c', color: '#fff', border: '1px solid #b71c1c' }}
                          >
                            {dismissMutation.isPending ? 'Dismissing...' : 'Yes, Dismiss It'}
                          </button>
                          <button
                            onClick={() => setConfirmDismissId(null)}
                            className="btn btn-ghost btn-sm"
                            disabled={dismissMutation.isPending}
                          >
                            No, Keep It
                          </button>
                        </div>
                      </div>
                    )}

                    {openConvertId === enq.id && (
                      <form
                        onSubmit={(e) => handleConvertSubmit(e, enq)}
                        style={{
                          marginTop: '12px',
                          padding: '14px',
                          borderRadius: '8px',
                          background: 'var(--brown-100)',
                          border: '1px solid rgba(62, 39, 35, 0.18)',
                        }}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                          <div className="field" style={{ marginBottom: 0 }}>
                            <label htmlFor={`convert-date-${enq.id}`}>Date *</label>
                            <input
                              id={`convert-date-${enq.id}`}
                              type="date"
                              className="input-glass"
                              value={convertDate}
                              onChange={(e) => setConvertDate(e.target.value)}
                              required
                            />
                          </div>
                          <div className="field" style={{ marginBottom: 0 }}>
                            <label htmlFor={`convert-time-${enq.id}`}>Time *</label>
                            <input
                              id={`convert-time-${enq.id}`}
                              type="time"
                              className="input-glass"
                              value={convertTime}
                              onChange={(e) => setConvertTime(e.target.value)}
                              required
                            />
                          </div>
                          <div className="field" style={{ marginBottom: 0 }}>
                            <label htmlFor={`convert-visit-type-${enq.id}`}>Visit Type *</label>
                            <select
                              id={`convert-visit-type-${enq.id}`}
                              className="input-glass"
                              value={convertVisitType}
                              onChange={(e) => setConvertVisitType(e.target.value)}
                              required
                              disabled={optionsLoading || visitTypes.length === 0}
                            >
                              <option value="">
                                {optionsLoading ? 'Loading...' : optionsError ? 'Could not load' : 'Select...'}
                              </option>
                              {visitTypes.map((vt) => (
                                <option key={vt.value} value={vt.value}>
                                  {vt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {optionsError && (
                          <div className="alert alert-danger" style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Could not load visit types.</span>
                            <button type="button" onClick={() => refetchOptions()} className="btn btn-ghost btn-sm">
                              Retry
                            </button>
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                          <button type="submit" className="btn btn-primary btn-sm" disabled={convertMutation.isPending}>
                            {convertMutation.isPending ? 'Booking...' : 'Confirm & Book'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setOpenConvertId(null)}
                            disabled={convertMutation.isPending}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </div>

                  {isNew && openConvertId !== enq.id && confirmDismissId !== enq.id && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => openConvertForm(enq)}
                        className="btn btn-primary btn-sm"
                        disabled={anyMutationPending}
                      >
                        <Icon name="check" /> Convert
                      </button>
                      <button
                        onClick={() => {
                          setOpenConvertId(null);
                          setConfirmDismissId(enq.id);
                        }}
                        className="btn btn-ghost btn-sm"
                        disabled={anyMutationPending}
                      >
                        <Icon name="close" /> Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
