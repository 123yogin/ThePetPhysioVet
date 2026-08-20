import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchAppointments, completeAppointment, approveReschedule, rejectReschedule } from '../api/appointments';
import { useFlash } from '../lib/flash';
import { Icon } from '../components/Icon';
import { humanizeStatus } from '../lib/labels';

export const AppointmentsScreen: React.FC = () => {
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [dateFilter, setDateFilter] = useState('');
  const [ownerSearch, setOwnerSearch] = useState('');
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(
    new Date().toISOString().slice(0, 10)
  );
  
  // Current calendar month view state
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth()); // 0-indexed (0 = Jan)

  const [processingId, setProcessingId] = useState<number | null>(null);

  const { addFlash } = useFlash();

  // Fetch all appointments (or filtered)
  const { data: appointments, isLoading, isError, refetch } = useQuery({
    queryKey: ['appointments', dateFilter, ownerSearch],
    queryFn: () => fetchAppointments({ date: dateFilter || undefined, owner: ownerSearch || undefined }),
  });

  const handleComplete = async (id: number) => {
    try {
      await completeAppointment(id);
      addFlash('Appointment completed successfully', 'success');
      refetch();
    } catch (err: any) {
      addFlash(err.message || 'Error completing appointment', 'error');
    }
  };

  const handleApproveReschedule = async (id: number, petName: string) => {
    setProcessingId(id);
    try {
      await approveReschedule(id);
      addFlash(`✓ Approved reschedule request for ${petName}. Appointment updated!`, 'success');
      refetch();
    } catch (err: any) {
      addFlash(err.message || 'Failed to approve reschedule request', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectReschedule = async (id: number, petName: string) => {
    setProcessingId(id);
    try {
      await rejectReschedule(id);
      addFlash(`Declined reschedule request for ${petName}. Appointment remains at original slot.`, 'info');
      refetch();
    } catch (err: any) {
      addFlash(err.message || 'Failed to decline reschedule request', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  // Calendar Helpers
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    setSelectedCalendarDate(today.toISOString().slice(0, 10));
  };

  // Generate matrix for month grid
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfWeek = (year: number, month: number) => {
    return new Date(year, month, 1).getDay(); // 0 = Sun
  };

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDayOfWeek = getFirstDayOfWeek(currentYear, currentMonth);

  // Pending Reschedule Requests
  const pendingReschedules = (appointments || []).filter(
    (a) => a.status === 'Reschedule Requested'
  );

  // Group appointments by date string "YYYY-MM-DD"
  const apptsByDate: Record<string, typeof appointments> = {};
  if (appointments) {
    appointments.forEach((a) => {
      if (!apptsByDate[a.date]) {
        apptsByDate[a.date] = [];
      }
      apptsByDate[a.date]!.push(a);
    });
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  // Filtered appointments for list view or selected date view
  const selectedDateAppointments = selectedCalendarDate
    ? (appointments || []).filter((a) => a.date === selectedCalendarDate)
    : [];

  return (
    <div>
      {/* Top Header & View Toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 className="page-title">Appointment Schedule</h1>
          <p className="page-sub" style={{ margin: 0 }}>Manage physical therapy sessions & calendar schedule</p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* View Mode Segmented Control Switch */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: 'rgba(255, 255, 255, 0.85)',
              border: '1px solid rgba(62, 39, 35, 0.18)',
              borderRadius: '24px',
              padding: '4px',
              gap: '4px',
              boxShadow: '0 2px 8px rgba(62, 39, 35, 0.06)',
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              aria-pressed={viewMode === 'calendar'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 16px',
                minHeight: '44px',
                fontSize: '13px',
                fontWeight: '700',
                borderRadius: '20px',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                background: viewMode === 'calendar' ? 'var(--brown-900)' : 'transparent',
                color: viewMode === 'calendar' ? '#ffffff' : 'var(--brown-700)',
                boxShadow: viewMode === 'calendar' ? '0 2px 6px rgba(62, 39, 35, 0.2)' : 'none',
              }}
            >
              <Icon name="calendar" /> Calendar View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 16px',
                minHeight: '44px',
                fontSize: '13px',
                fontWeight: '700',
                borderRadius: '20px',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                background: viewMode === 'list' ? 'var(--brown-900)' : 'transparent',
                color: viewMode === 'list' ? '#ffffff' : 'var(--brown-700)',
                boxShadow: viewMode === 'list' ? '0 2px 6px rgba(62, 39, 35, 0.2)' : 'none',
              }}
            >
              <Icon name="list" /> List View
            </button>
          </div>

          <Link to="/appointments/new" className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
            + Book Appointment
          </Link>
        </div>
      </div>

      {isError && (
        <div className="alert alert-danger" style={{ marginBottom: '20px' }}>
          Could not load appointments schedule.{' '}
          <button onClick={() => refetch()} className="btn btn-ghost btn-sm">
            Retry
          </button>
        </div>
      )}

      {/* PENDING RESCHEDULE REQUESTS FROM PET OWNERS */}
      {pendingReschedules.length > 0 && (
        <div
          className="glass-card"
          style={{
            marginBottom: '24px',
            padding: '20px',
            borderLeft: '6px solid #0d47a1',
            background: 'rgba(21, 101, 192, 0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Icon name="mail" size={20} style={{ color: '#0d47a1' }} />
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#0d47a1', margin: 0 }}>
              Pending Reschedule Requests from Pet Owners ({pendingReschedules.length})
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {pendingReschedules.map((reqAppt) => (
              <div
                key={reqAppt.id}
                style={{
                  background: '#ffffff',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  border: '1px solid rgba(62, 39, 35, 0.12)',
                  boxShadow: '0 2px 8px rgba(62, 39, 35, 0.04)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '16px',
                }}
              >
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--brown-900)' }}>
                    🐕 {reqAppt.pet_name} <span style={{ fontWeight: '500', color: 'var(--brown-700)', fontSize: '14px' }}>— Owner: {reqAppt.owner_name} ({reqAppt.owner_phone})</span>
                  </div>

                  <div style={{ display: 'flex', gap: '16px', marginTop: '6px', fontSize: '14px', flexWrap: 'wrap' }}>
                    <div style={{ color: 'var(--brown-700)' }}>
                      <strong>Original Slot:</strong> <span style={{ textDecoration: 'line-through' }}>{reqAppt.date} @ {reqAppt.time?.substring(0, 5) || '--:--'}</span>
                    </div>
                    <div style={{ color: 'var(--brown-700)', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Icon name="arrowRight" size={14} /> <strong>Requested Slot:</strong> {reqAppt.requested_date} @ {reqAppt.requested_time ? reqAppt.requested_time.substring(0, 5) : '10:00'}
                    </div>
                  </div>

                  {reqAppt.reschedule_reason && (
                    <div style={{ marginTop: '8px', fontSize: '13px', background: 'rgba(62, 39, 35, 0.06)', padding: '8px 12px', borderRadius: '6px', color: 'var(--brown-700)' }}>
                      <strong>Owner's Reason:</strong> "{reqAppt.reschedule_reason}"
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    disabled={processingId === reqAppt.id}
                    onClick={() => handleApproveReschedule(reqAppt.id, reqAppt.pet_name)}
                    className="btn btn-secondary btn-sm"
                    style={{ background: 'rgba(46, 125, 50, 0.1)', color: '#1b5e20', borderColor: 'rgba(46, 125, 50, 0.25)' }}
                  >
                    <Icon name="check" /> {processingId === reqAppt.id ? 'Approving...' : 'Approve Request'}
                  </button>
                  <button
                    disabled={processingId === reqAppt.id}
                    onClick={() => handleRejectReschedule(reqAppt.id, reqAppt.pet_name)}
                    className="btn btn-ghost btn-sm"
                    style={{ color: '#b71c1c', borderColor: 'rgba(198, 40, 40, 0.25)' }}
                  >
                    <Icon name="close" /> {processingId === reqAppt.id ? 'Declining...' : 'Decline Request'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CALENDAR VIEW */}
      {viewMode === 'calendar' && (
        <div>
          {/* Month Navigation & Controls */}
          <div className="glass-card" style={{ marginBottom: '20px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button onClick={prevMonth} className="btn btn-secondary btn-sm">
                &larr; Prev
              </button>
              <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--brown-900)', margin: 0, minWidth: '180px', textAlign: 'center' }}>
                {monthNames[currentMonth]} {currentYear}
              </h2>
              <button onClick={nextMonth} className="btn btn-secondary btn-sm">
                Next &rarr;
              </button>
              <button onClick={goToToday} className="btn btn-ghost btn-sm" style={{ marginLeft: '8px' }}>
                Jump to Today
              </button>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <input
                type="text"
                className="input-glass"
                placeholder="Search owner / pet..."
                value={ownerSearch}
                onChange={(e) => setOwnerSearch(e.target.value)}
                style={{ width: '200px', fontSize: '13px' }}
              />
              {ownerSearch && (
                <button onClick={() => setOwnerSearch('')} className="btn btn-ghost btn-sm">
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Calendar Month Grid */}
          <div className="glass-card" style={{ padding: '16px', overflowX: 'auto', marginBottom: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(110px, 1fr))', gap: '8px', minWidth: '800px' }}>
              {/* Day Name Headers */}
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div
                  key={d}
                  style={{
                    textAlign: 'center',
                    fontWeight: '700',
                    fontSize: '13px',
                    color: 'var(--brown-700)',
                    padding: '8px 0',
                    borderBottom: '2px solid var(--glass-border)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {d}
                </div>
              ))}

              {/* Blank Offset Cells */}
              {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
                <div key={`empty-${idx}`} style={{ minHeight: '90px', opacity: 0.25, background: 'rgba(62, 39, 35, 0.04)', borderRadius: '8px' }} />
              ))}

              {/* Days of Month */}
              {Array.from({ length: daysInMonth }).map((_, idx) => {
                const dayNum = idx + 1;
                const monthStr = String(currentMonth + 1).padStart(2, '0');
                const dayStr = String(dayNum).padStart(2, '0');
                const formattedDate = `${currentYear}-${monthStr}-${dayStr}`;

                const isToday = formattedDate === todayStr;
                const isSelected = formattedDate === selectedCalendarDate;
                const dayAppts = apptsByDate[formattedDate] || [];

                return (
                  <div
                    key={formattedDate}
                    onClick={() => setSelectedCalendarDate(formattedDate)}
                    style={{
                      minHeight: '100px',
                      padding: '8px',
                      borderRadius: '10px',
                      background: isSelected
                        ? 'var(--brown-100)'
                        : isToday
                        ? 'var(--cream-deep)'
                        : 'rgba(255, 255, 255, 0.6)',
                      border: isSelected
                        ? '2px solid var(--primary)'
                        : isToday
                        ? '2px dashed var(--accent)'
                        : '1px solid var(--glass-border)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span
                        style={{
                          fontWeight: isToday || isSelected ? '800' : '600',
                          fontSize: '14px',
                          color: isToday ? 'var(--primary)' : 'var(--brown-900)',
                          background: isToday ? 'var(--primary-light)' : 'transparent',
                          padding: isToday ? '2px 8px' : '0',
                          borderRadius: '12px',
                        }}
                      >
                        {dayNum}
                      </span>
                      {dayAppts.length > 0 && (
                        <span className="badge badge-primary" style={{ fontSize: '10px', padding: '1px 5px' }}>
                          {dayAppts.length} {dayAppts.length === 1 ? 'visit' : 'visits'}
                        </span>
                      )}
                    </div>

                    {/* Appointment Cards inside Cell */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px', flex: 1, overflowY: 'hidden' }}>
                      {dayAppts.slice(0, 2).map((a) => (
                        <div
                          key={a.id}
                          style={{
                            fontSize: '11px',
                            padding: '3px 6px',
                            borderRadius: '4px',
                            background: a.status === 'Reschedule Requested'
                              ? 'rgba(21, 101, 192, 0.1)'
                              : a.status === 'Completed'
                              ? 'var(--success-light)'
                              : 'rgba(255, 255, 255, 0.9)',
                            borderLeft: `3px solid ${
                              a.status === 'Reschedule Requested'
                                ? '#0d47a1'
                                : a.status === 'Completed'
                                ? '#1b5e20'
                                : 'var(--primary)'
                            }`,
                            color: 'var(--brown-900)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            fontWeight: '600',
                          }}
                        >
                          {a.time?.substring(0, 5) || '--:--'} {a.pet_name}{' '}
                          {a.status === 'Reschedule Requested' && <Icon name="clock" size={11} />}
                        </div>
                      ))}
                      {dayAppts.length > 2 && (
                        <div style={{ fontSize: '10px', color: 'var(--brown-600)', fontStyle: 'italic', textAlign: 'center' }}>
                          +{dayAppts.length - 2} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Date Schedule Panel */}
          {selectedCalendarDate && (
            <div className="glass-card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--brown-900)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icon name="calendar" /> Visits Scheduled for {selectedCalendarDate} {selectedCalendarDate === todayStr ? '(Today)' : ''}
                </h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Link to={`/appointments/new?date=${selectedCalendarDate}`} className="btn btn-secondary btn-sm">
                    + Book Session for {selectedCalendarDate}
                  </Link>
                  <button onClick={() => setSelectedCalendarDate(null)} className="btn btn-ghost btn-sm">
                    Dismiss Panel
                  </button>
                </div>
              </div>

              {selectedDateAppointments.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--brown-500)' }}>
                  No therapy appointments scheduled for this date.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {selectedDateAppointments.map((appt) => (
                    <div
                      key={appt.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px 20px',
                        borderRadius: '12px',
                        background: appt.status === 'Reschedule Requested' ? 'rgba(21, 101, 192, 0.1)' : 'rgba(255, 255, 255, 0.8)',
                        border: appt.status === 'Reschedule Requested' ? '1px solid rgba(21, 101, 192, 0.25)' : '1px solid var(--glass-border)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--brown-900)', minWidth: '70px' }}>
                          {appt.time?.substring(0, 5) || '--:--'}
                        </div>
                        <div>
                          <div style={{ fontSize: '16px', fontWeight: '700' }}>
                            <Link to={`/patients/${appt.pet_id}`} className="table-link" style={{ textDecoration: 'none' }}>
                              🐕 {appt.pet_name}
                            </Link>
                          </div>
                          <div style={{ fontSize: '13px', color: 'var(--brown-700)', marginTop: '2px' }}>
                            <strong>Owner:</strong> {appt.owner_name} ({appt.owner_phone}) &bull;{' '}
                            <strong>Type:</strong> {appt.visit_type_display || appt.visit_type}
                          </div>

                          {appt.status === 'Reschedule Requested' && (
                            <div style={{ marginTop: '6px', fontSize: '13px', color: '#0d47a1', background: 'rgba(21, 101, 192, 0.1)', padding: '6px 10px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Icon name="clock" size={13} /> <strong>Requested New Slot:</strong> {appt.requested_date} @ {appt.requested_time ? appt.requested_time.substring(0, 5) : '10:00'}
                              {appt.reschedule_reason && <span> — <em>"{appt.reschedule_reason}"</em></span>}
                            </div>
                          )}

                          {appt.reason_notes && appt.status !== 'Reschedule Requested' && (
                            <div style={{ fontSize: '12px', color: 'var(--brown-600)', marginTop: '2px', fontStyle: 'italic' }}>
                              "{appt.reason_notes}"
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className={`badge badge-${(appt.status || 'confirmed').toLowerCase().replace(/\s+/g, '-')}`}>
                          {humanizeStatus(appt.status)}
                        </span>

                        {appt.status === 'Reschedule Requested' ? (
                          <>
                            <button
                              disabled={processingId === appt.id}
                              onClick={() => handleApproveReschedule(appt.id, appt.pet_name)}
                              className="btn btn-secondary btn-sm"
                              style={{ background: 'rgba(46, 125, 50, 0.1)', color: '#1b5e20', borderColor: 'rgba(46, 125, 50, 0.25)' }}
                            >
                              Approve
                            </button>
                            <button
                              disabled={processingId === appt.id}
                              onClick={() => handleRejectReschedule(appt.id, appt.pet_name)}
                              className="btn btn-ghost btn-sm"
                              style={{ color: '#b71c1c' }}
                            >
                              Decline
                            </button>
                          </>
                        ) : (
                          <>
                            {appt.status !== 'Completed' && (
                              <button
                                onClick={() => handleComplete(appt.id)}
                                className="btn btn-secondary btn-sm"
                              >
                                <Icon name="check" /> Complete
                              </button>
                            )}

                            <Link to={`/appointments/${appt.id}/reschedule`} className="btn btn-ghost btn-sm">
                              Reschedule
                            </Link>
                          </>
                        )}

                        <Link to={`/appointments/${appt.id}/share`} className="btn btn-ghost btn-sm">
                          Share
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode === 'list' && (
        <div>
          {/* Filters Bar */}
          <div className="glass-card" style={{ marginBottom: '24px' }}>
            <div className="filter-bar" style={{ margin: 0 }}>
              <div style={{ flex: 1, minWidth: '180px' }}>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--brown-700)', display: 'block', marginBottom: '4px' }}>
                  Filter by Date
                </label>
                <input
                  type="date"
                  className="input-glass"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                />
              </div>
              <div style={{ flex: 2, minWidth: '220px' }}>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--brown-700)', display: 'block', marginBottom: '4px' }}>
                  Search Owner / Patient
                </label>
                <input
                  type="text"
                  className="input-glass"
                  placeholder="Search owner or pet name..."
                  value={ownerSearch}
                  onChange={(e) => setOwnerSearch(e.target.value)}
                />
              </div>
              {(dateFilter || ownerSearch) && (
                <button
                  onClick={() => {
                    setDateFilter('');
                    setOwnerSearch('');
                  }}
                  className="btn btn-ghost btn-sm"
                >
                  Reset Filters
                </button>
              )}
            </div>
          </div>

          {isLoading ? (
            <p style={{ color: 'var(--brown-500)' }}>Loading schedule...</p>
          ) : !appointments || appointments.length === 0 ? (
            <div className="glass-card" style={{ textAlign: 'center', padding: '40px' }}>
              <p style={{ color: 'var(--brown-500)', margin: 0 }}>No appointments match the criteria.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Patient</th>
                    <th>Owner</th>
                    <th>Visit Type</th>
                    <th>Status / Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((appt) => (
                    <tr key={appt.id}>
                      <td style={{ fontWeight: 700 }}>
                        {appt.date} @ {appt.time?.substring(0, 5) || '--:--'}
                      </td>
                      <td>
                        <Link to={`/patients/${appt.pet_id}`} className="table-link">
                          🐕 {appt.pet_name}
                        </Link>
                      </td>
                      <td>{appt.owner_name} ({appt.owner_phone})</td>
                      <td>{appt.visit_type_display || appt.visit_type}</td>
                      <td>
                        <span className={`badge badge-${(appt.status || 'confirmed').toLowerCase().replace(/\s+/g, '-')}`}>
                          {humanizeStatus(appt.status)}
                        </span>
                        {appt.status === 'Reschedule Requested' && (
                          <div style={{ fontSize: '11px', color: '#0d47a1', marginTop: '4px' }}>
                            Req: {appt.requested_date} @ {appt.requested_time ? appt.requested_time.substring(0, 5) : '10:00'}<br />
                            <em>"{appt.reschedule_reason}"</em>
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {appt.status === 'Reschedule Requested' ? (
                            <>
                              <button
                                disabled={processingId === appt.id}
                                onClick={() => handleApproveReschedule(appt.id, appt.pet_name)}
                                className="btn btn-secondary btn-sm"
                                style={{ background: 'rgba(46, 125, 50, 0.1)', color: '#1b5e20', borderColor: 'rgba(46, 125, 50, 0.25)' }}
                              >
                                Approve
                              </button>
                              <button
                                disabled={processingId === appt.id}
                                onClick={() => handleRejectReschedule(appt.id, appt.pet_name)}
                                className="btn btn-ghost btn-sm"
                                style={{ color: '#b71c1c' }}
                              >
                                Decline
                              </button>
                            </>
                          ) : (
                            <>
                              {appt.status !== 'Completed' && (
                                <button
                                  onClick={() => handleComplete(appt.id)}
                                  className="btn btn-secondary btn-sm"
                                >
                                  Complete
                                </button>
                              )}
                              <Link to={`/appointments/${appt.id}/reschedule`} className="btn btn-ghost btn-sm">
                                Reschedule
                              </Link>
                            </>
                          )}
                          <Link to={`/appointments/${appt.id}/share`} className="btn btn-ghost btn-sm">
                            Share
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
