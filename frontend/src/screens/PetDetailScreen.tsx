import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchPetDetail } from '../api/pets';
import { fetchPetDiagnoses, createDiagnosis } from '../api/diagnoses';
import { fetchPetTreatmentPlans, createTreatmentPlan, addProgressNote } from '../api/treatment';
import { fetchInvoices } from '../api/billing';
import { fetchPetQueries, sendQueryMessage } from '../api/queries';
import { useFlash } from '../lib/flash';

export const PetDetailScreen: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const petId = Number(id);
  const { addFlash } = useFlash();

  const [activeTab, setActiveTab] = useState<'overview' | 'diagnoses' | 'treatment' | 'billing' | 'queries'>('overview');

  // Form states
  const [diagNotes, setDiagNotes] = useState('');
  const [diagFile, setDiagFile] = useState<File | null>(null);
  const [diagType, setDiagType] = useState('XRAY');

  const [therapies, setTherapies] = useState('LASER, STRETCHING');
  const [frequency, setFrequency] = useState('WEEKLY');
  const [duration, setDuration] = useState('4WK');

  const [noteText, setNoteText] = useState('');
  const [replyMessage, setReplyMessage] = useState('');

  const { data: pet, isLoading: petLoading, isError: petError, refetch: refetchPet } = useQuery({
    queryKey: ['pet', petId],
    queryFn: () => fetchPetDetail(petId),
    enabled: !!petId,
  });

  const { data: diagnoses, isError: diagnosesError, refetch: refetchDiagnoses } = useQuery({
    queryKey: ['diagnoses', petId],
    queryFn: () => fetchPetDiagnoses(petId),
    enabled: !!petId,
  });

  const { data: treatmentPlans, isError: plansError, refetch: refetchPlans } = useQuery({
    queryKey: ['treatmentPlans', petId],
    queryFn: () => fetchPetTreatmentPlans(petId),
    enabled: !!petId,
  });

  const { data: invoices, isError: invoicesError, refetch: refetchInvoices } = useQuery({
    queryKey: ['invoices', petId],
    queryFn: () => fetchInvoices(petId),
    enabled: !!petId,
  });

  const { data: queryThread, isError: queriesError, refetch: refetchQueries } = useQuery({
    queryKey: ['petQueries', petId],
    queryFn: () => fetchPetQueries(petId),
    enabled: !!petId,
  });

  const handleUploadDiagnosis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!diagFile) return addFlash('Please select an image/radiograph file', 'error');
    const formData = new FormData();
    formData.append('report_type', diagType);
    formData.append('notes', diagNotes);
    formData.append('file', diagFile);

    try {
      await createDiagnosis(petId, formData);
      addFlash('Diagnostic record uploaded', 'success');
      setDiagNotes('');
      setDiagFile(null);
      refetchDiagnoses();
    } catch (err: any) {
      addFlash(err.message || 'Failed to upload diagnosis', 'error');
    }
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createTreatmentPlan(petId, {
        therapies: therapies.split(',').map((s) => s.trim()),
        frequency,
        duration,
        start_date: new Date().toISOString().split('T')[0],
      });
      addFlash('Treatment plan created', 'success');
      refetchPlans();
    } catch (err: any) {
      addFlash(err.message || 'Failed to create plan', 'error');
    }
  };

  const handleAddNote = async (planId: number) => {
    if (!noteText.trim()) return;
    try {
      await addProgressNote(planId, { notes: noteText });
      addFlash('Progress note saved', 'success');
      setNoteText('');
      refetchPlans();
    } catch (err: any) {
      addFlash(err.message || 'Failed to add progress note', 'error');
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyMessage.trim()) return;
    const formData = new FormData();
    formData.append('message', replyMessage);
    try {
      await sendQueryMessage(petId, formData);
      addFlash('Reply sent to owner', 'success');
      setReplyMessage('');
      refetchQueries();
    } catch (err: any) {
      addFlash(err.message || 'Failed to send message', 'error');
    }
  };

  if (petLoading) return <p>Loading pet clinical records...</p>;

  if (petError) {
    return (
      <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Could not load this patient's record.</span>
        <button onClick={() => refetchPet()} className="btn btn-ghost btn-sm">
          Retry
        </button>
      </div>
    );
  }

  if (!pet) return <p>Patient not found.</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <Link to="/patients" className="btn btn-ghost btn-sm" style={{ marginBottom: '8px' }}>
            &larr; Back to Patients
          </Link>
          <h1 className="page-title">{pet.name}</h1>
          <p className="page-sub">
            {pet.pet_type || pet.species} &bull; Owner: {pet.owner_name} ({pet.owner_phone})
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Link to={`/appointments/new?pet=${pet.id}`} className="btn btn-primary btn-sm">
            + Schedule Visit
          </Link>
          <Link to={`/invoices/new?pet=${pet.id}`} className="btn btn-secondary btn-sm">
            + Create Invoice
          </Link>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '2px solid var(--glass-border)', paddingBottom: '12px' }}>
        <button
          onClick={() => setActiveTab('overview')}
          className={`btn ${activeTab === 'overview' ? 'btn-primary' : 'btn-ghost'}`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('diagnoses')}
          className={`btn ${activeTab === 'diagnoses' ? 'btn-primary' : 'btn-ghost'}`}
        >
          Diagnostics ({diagnosesError ? '!' : diagnoses?.length ?? 0})
        </button>
        <button
          onClick={() => setActiveTab('treatment')}
          className={`btn ${activeTab === 'treatment' ? 'btn-primary' : 'btn-ghost'}`}
        >
          Rehab Plans ({plansError ? '!' : treatmentPlans?.length ?? 0})
        </button>
        <button
          onClick={() => setActiveTab('billing')}
          className={`btn ${activeTab === 'billing' ? 'btn-primary' : 'btn-ghost'}`}
        >
          Invoices ({invoicesError ? '!' : invoices?.length ?? 0})
        </button>
        <button
          onClick={() => setActiveTab('queries')}
          className={`btn ${activeTab === 'queries' ? 'btn-primary' : 'btn-ghost'}`}
        >
          Queries & Messages
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="glass-card">
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '700' }}>Clinical Details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div><strong>Breed:</strong> {pet.breed || 'N/A'}</div>
            <div><strong>Age / Sex:</strong> {pet.age || 'N/A'} / {pet.sex || 'N/A'}</div>
            <div><strong>Weight:</strong> {pet.weight ? `${pet.weight} kg` : 'N/A'}</div>
            <div><strong>Referred By:</strong> {pet.referred_by || 'Self-referred'}</div>
          </div>

          <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--glass-border)' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Chief Complaint & Medical History</h4>
            <p style={{ margin: 0, color: 'var(--brown-700)', lineHeight: '1.6' }}>
              {pet.complaint || pet.medical_history || 'No detailed medical history recorded yet.'}
            </p>
          </div>
        </div>
      )}

      {/* Diagnostics Tab */}
      {activeTab === 'diagnoses' && (
        <div>
          <div className="glass-card" style={{ marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Upload Diagnostic Image / Report</h3>
            <form onSubmit={handleUploadDiagnosis}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="field">
                  <label>Report Type</label>
                  <select value={diagType} onChange={(e) => setDiagType(e.target.value)} className="input-glass">
                    <option value="XRAY">X-Ray Radiograph</option>
                    <option value="MRI">MRI Scan</option>
                    <option value="CT">CT Scan</option>
                    <option value="ULTRASOUND">Ultrasound</option>
                    <option value="OTHER">Other Report</option>
                  </select>
                </div>
                <div className="field">
                  <label>File Upload (Image / DICOM / PDF)</label>
                  <input
                    type="file"
                    className="input-glass"
                    onChange={(e) => setDiagFile(e.target.files?.[0] || null)}
                  />
                </div>
              </div>
              <div className="field">
                <label>Clinical Notes</label>
                <textarea
                  className="input-glass"
                  rows={3}
                  value={diagNotes}
                  onChange={(e) => setDiagNotes(e.target.value)}
                  placeholder="Radiograph observations, joint space notes..."
                />
              </div>
              <button type="submit" className="btn btn-primary">
                Upload Diagnostic Record
              </button>
            </form>
          </div>

          <div className="glass-card">
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Uploaded Diagnostic Reports</h3>
            {diagnosesError ? (
              <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Could not load diagnostic reports.</span>
                <button onClick={() => refetchDiagnoses()} className="btn btn-ghost btn-sm">
                  Retry
                </button>
              </div>
            ) : !diagnoses || diagnoses.length === 0 ? (
              <p style={{ color: 'var(--brown-500)' }}>No diagnostic reports uploaded yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {diagnoses.map((d) => (
                  <div key={d.id} style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.8)', border: '1px solid var(--glass-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span className="badge badge-confirmed">{d.report_type_display || d.report_type}</span>
                      <span style={{ fontSize: '12px', color: 'var(--brown-500)' }}>{d.uploaded_at?.substring(0, 10) || '—'}</span>
                    </div>
                    <div>{d.notes || 'No notes'}</div>
                    {d.file_url && (
                      <a href={d.file_url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ marginTop: '12px', display: 'inline-block' }}>
                        📎 View File ({d.original_filename})
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Treatment Tab */}
      {activeTab === 'treatment' && (
        <div>
          <div className="glass-card" style={{ marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Create New Physical Therapy Plan</h3>
            <form onSubmit={handleCreatePlan}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="field">
                  <label>Therapies (Comma Separated)</label>
                  <input
                    className="input-glass"
                    value={therapies}
                    onChange={(e) => setTherapies(e.target.value)}
                    placeholder="LASER, STRETCHING, HYDROTHERAPY"
                  />
                </div>
                <div className="field">
                  <label>Frequency</label>
                  <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="input-glass">
                    <option value="WEEKLY">Weekly</option>
                    <option value="TWICE_WEEKLY">Twice Weekly</option>
                    <option value="BIWEEKLY">Bi-weekly</option>
                  </select>
                </div>
                <div className="field">
                  <label>Duration</label>
                  <select value={duration} onChange={(e) => setDuration(e.target.value)} className="input-glass">
                    <option value="2WK">2 Weeks</option>
                    <option value="4WK">4 Weeks</option>
                    <option value="8WK">8 Weeks</option>
                  </select>
                </div>
              </div>
              <button type="submit" className="btn btn-primary">
                Save Treatment Plan
              </button>
            </form>
          </div>

          {plansError && (
            <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Could not load treatment plans.</span>
              <button onClick={() => refetchPlans()} className="btn btn-ghost btn-sm">
                Retry
              </button>
            </div>
          )}

          {!plansError && (!treatmentPlans || treatmentPlans.length === 0) && (
            <p style={{ color: 'var(--brown-500)' }}>No treatment plans created yet.</p>
          )}

          {treatmentPlans?.map((plan) => (
            <div key={plan.id} className="glass-card" style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ margin: 0, fontSize: '16px' }}>Rehab Regimen #{plan.id}</h4>
                <span className="badge badge-completed">{plan.status || 'Unknown'}</span>
              </div>
              <p><strong>Therapies:</strong> {plan.therapies?.join(', ') || '—'}</p>
              <p><strong>Frequency & Duration:</strong> {plan.frequency || '—'} &bull; {plan.duration || '—'}</p>

              <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--glass-border)' }}>
                <h5 style={{ margin: '0 0 12px 0' }}>Session Progress Notes</h5>
                {plan.progress_notes?.map((n) => (
                  <div key={n.id} style={{ padding: '10px', background: 'rgba(255,255,255,0.7)', borderRadius: '8px', marginBottom: '8px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 'bold' }}>Session {n.session_no}</div>
                    <div>{n.notes}</div>
                  </div>
                ))}

                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <input
                    type="text"
                    className="input-glass"
                    placeholder="Add new session note..."
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                  />
                  <button onClick={() => handleAddNote(plan.id)} className="btn btn-secondary">
                    Add Note
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Billing Tab */}
      {activeTab === 'billing' && (
        <div className="glass-card">
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Patient Invoices</h3>
          {invoicesError ? (
            <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Could not load invoices.</span>
              <button onClick={() => refetchInvoices()} className="btn btn-ghost btn-sm">
                Retry
              </button>
            </div>
          ) : !invoices || invoices.length === 0 ? (
            <p style={{ color: 'var(--brown-500)' }}>No invoices created yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Invoice No</th>
                    <th>Date</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td>{inv.invoice_no}</td>
                      <td>{inv.created_at?.substring(0, 10) || '—'}</td>
                      <td>₹{inv.total ?? '—'}</td>
                      <td><span className="badge badge-confirmed">{inv.payment_status || 'Unknown'}</span></td>
                      <td>
                        <Link to={`/invoices/${inv.id}`} className="btn btn-secondary btn-sm">
                          View Invoice
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Queries Tab */}
      {activeTab === 'queries' && (
        <div className="glass-card">
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Owner Query Thread</h3>
          {queriesError && (
            <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Could not load the query thread.</span>
              <button onClick={() => refetchQueries()} className="btn btn-ghost btn-sm">
                Retry
              </button>
            </div>
          )}
          {queriesError ? null : !queryThread || !queryThread.messages || queryThread.messages.length === 0 ? (
            <p style={{ color: 'var(--brown-500)' }}>No messages from pet owner yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              {queryThread.messages.map((m) => (
                <div
                  key={m.id}
                  style={{
                    alignSelf: m.sender_role === 'DOCTOR' ? 'flex-end' : 'flex-start',
                    maxWidth: '80%',
                    padding: '14px 18px',
                    borderRadius: '16px',
                    background: m.sender_role === 'DOCTOR' ? 'var(--brown-900)' : 'rgba(255,255,255,0.9)',
                    color: m.sender_role === 'DOCTOR' ? '#ffffff' : 'var(--brown-900)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                  }}
                >
                  <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '4px' }}>
                    {m.sender_name} ({m.sender_role})
                  </div>
                  <div>{m.message}</div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleSendReply} style={{ display: 'flex', gap: '12px' }}>
            <input
              type="text"
              className="input-glass"
              placeholder="Type Doctor reply to owner..."
              value={replyMessage}
              onChange={(e) => setReplyMessage(e.target.value)}
            />
            <button type="submit" className="btn btn-primary">
              Send Reply
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
