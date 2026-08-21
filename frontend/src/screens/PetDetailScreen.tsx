import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchPetDetail } from '../api/pets';
import { fetchPetDiagnoses, createDiagnosis, deleteDiagnosis } from '../api/diagnoses';
import { fetchPetTreatmentPlans, createTreatmentPlan, addProgressNote } from '../api/treatment';
import { fetchInvoices } from '../api/billing';
import { fetchPetQueries, sendQueryMessage } from '../api/queries';
import { useFlash } from '../lib/flash';
import { Icon } from '../components/Icon';
import { humanizeStatus, petEmoji, friendlyDate } from '../lib/labels';

type TabKey = 'overview' | 'diagnoses' | 'treatment' | 'billing' | 'queries';

const VALID_TABS: TabKey[] = ['overview', 'diagnoses', 'treatment', 'billing', 'queries'];

// Sex codes are database enums, not something an owner or clinician should
// have to decode. humanizeStatus() only title-cases underscores, which
// doesn't help two-letter codes, so map the known ones here.
const SEX_LABELS: Record<string, string> = {
  M: 'Male',
  F: 'Female',
  MN: 'Male (Neutered)',
  FS: 'Female (Spayed)',
};
function sexLabel(sex?: string | null): string {
  if (!sex) return 'N/A';
  return SEX_LABELS[sex] || humanizeStatus(sex);
}

export const PetDetailScreen: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const petId = Number(id);
  const { addFlash } = useFlash();
  const [searchParams] = useSearchParams();

  const tabParam = searchParams.get('tab') as TabKey | null;
  const initialTab: TabKey = tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'overview';
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  // If the deep-link query param changes (e.g. navigating here again from the
  // inbox while already on this route), follow it.
  useEffect(() => {
    if (tabParam && VALID_TABS.includes(tabParam)) {
      setActiveTab(tabParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam]);

  // Form states
  const [diagNotes, setDiagNotes] = useState('');
  const [diagFile, setDiagFile] = useState<File | null>(null);
  const [diagType, setDiagType] = useState('XRAY');
  const [uploadingDiagnosis, setUploadingDiagnosis] = useState(false);
  const [deletingDiagnosisId, setDeletingDiagnosisId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const [therapies, setTherapies] = useState('');
  const [frequency, setFrequency] = useState('WEEKLY');
  const [duration, setDuration] = useState('4WK');
  const [creatingPlan, setCreatingPlan] = useState(false);

  const [noteTextByPlan, setNoteTextByPlan] = useState<Record<number, string>>({});
  const [savingNotePlanId, setSavingNotePlanId] = useState<number | null>(null);

  const [replyMessage, setReplyMessage] = useState('');
  const [replyFile, setReplyFile] = useState<File | null>(null);
  const [sendingReply, setSendingReply] = useState(false);

  const { data: pet, isLoading: petLoading, isError: petError, refetch: refetchPet } = useQuery({
    queryKey: ['pet', petId],
    queryFn: () => fetchPetDetail(petId),
    enabled: !!petId,
  });

  // These four tabs' data is only fetched once the doctor actually opens the
  // tab — previously all five queries fired on mount regardless of which tab
  // was visible.
  const { data: diagnoses, isError: diagnosesError, refetch: refetchDiagnoses } = useQuery({
    queryKey: ['diagnoses', petId],
    queryFn: () => fetchPetDiagnoses(petId),
    enabled: !!petId && activeTab === 'diagnoses',
  });

  const { data: treatmentPlans, isError: plansError, refetch: refetchPlans } = useQuery({
    queryKey: ['treatmentPlans', petId],
    queryFn: () => fetchPetTreatmentPlans(petId),
    enabled: !!petId && activeTab === 'treatment',
  });

  const { data: invoices, isError: invoicesError, refetch: refetchInvoices } = useQuery({
    queryKey: ['invoices', petId],
    queryFn: () => fetchInvoices(petId),
    enabled: !!petId && activeTab === 'billing',
  });

  const { data: queryThread, isError: queriesError, refetch: refetchQueries } = useQuery({
    queryKey: ['petQueries', petId],
    queryFn: () => fetchPetQueries(petId),
    enabled: !!petId && activeTab === 'queries',
  });

  const handleUploadDiagnosis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!diagFile) return addFlash('Please select an image/radiograph file', 'error');
    const formData = new FormData();
    formData.append('report_type', diagType);
    formData.append('notes', diagNotes);
    formData.append('file', diagFile);

    setUploadingDiagnosis(true);
    try {
      await createDiagnosis(petId, formData);
      addFlash('Report uploaded', 'success');
      setDiagNotes('');
      setDiagFile(null);
      refetchDiagnoses();
    } catch (err: any) {
      addFlash(err.message || 'Failed to upload report', 'error');
    } finally {
      setUploadingDiagnosis(false);
    }
  };

  const handleDeleteDiagnosis = async (diagnosisId: number) => {
    if (confirmDeleteId !== diagnosisId) {
      // First click just arms the confirmation — nothing destructive happens yet.
      setConfirmDeleteId(diagnosisId);
      return;
    }
    setDeletingDiagnosisId(diagnosisId);
    try {
      await deleteDiagnosis(diagnosisId);
      addFlash('Report deleted', 'success');
      setConfirmDeleteId(null);
      refetchDiagnoses();
    } catch (err: any) {
      addFlash(err.message || 'Failed to delete report', 'error');
    } finally {
      setDeletingDiagnosisId(null);
    }
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!therapies.trim()) return addFlash('Please enter at least one therapy', 'error');
    setCreatingPlan(true);
    try {
      await createTreatmentPlan(petId, {
        therapies: therapies.split(',').map((s) => s.trim()).filter(Boolean),
        frequency,
        duration,
        start_date: new Date().toISOString().split('T')[0],
      });
      addFlash('Treatment plan created', 'success');
      setTherapies('');
      refetchPlans();
    } catch (err: any) {
      addFlash(err.message || 'Failed to create plan', 'error');
    } finally {
      setCreatingPlan(false);
    }
  };

  const handleAddNote = async (planId: number) => {
    const text = (noteTextByPlan[planId] || '').trim();
    if (!text) {
      addFlash('Please type a note before saving', 'error');
      return;
    }
    setSavingNotePlanId(planId);
    try {
      await addProgressNote(planId, { notes: text });
      addFlash('Progress note saved', 'success');
      setNoteTextByPlan((prev) => ({ ...prev, [planId]: '' }));
      refetchPlans();
    } catch (err: any) {
      addFlash(err.message || 'Failed to add progress note', 'error');
    } finally {
      setSavingNotePlanId(null);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyMessage.trim() && !replyFile) {
      addFlash('Please type a message or attach a file before sending', 'error');
      return;
    }
    const formData = new FormData();
    formData.append('message', replyMessage);
    if (replyFile) formData.append('file', replyFile);
    setSendingReply(true);
    try {
      await sendQueryMessage(petId, formData);
      addFlash('Reply sent to owner', 'success');
      setReplyMessage('');
      setReplyFile(null);
      refetchQueries();
    } catch (err: any) {
      addFlash(err.message || 'Failed to send message', 'error');
    } finally {
      setSendingReply(false);
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
          <h1 className="page-title">{petEmoji(pet.species || pet.pet_type)} {pet.name}</h1>
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
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '2px solid var(--glass-border)', paddingBottom: '12px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
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
          Scans & Reports{diagnosesError ? ' (!)' : diagnoses ? ` (${diagnoses.length})` : ''}
        </button>
        <button
          onClick={() => setActiveTab('treatment')}
          className={`btn ${activeTab === 'treatment' ? 'btn-primary' : 'btn-ghost'}`}
        >
          Rehab Plans{plansError ? ' (!)' : treatmentPlans ? ` (${treatmentPlans.length})` : ''}
        </button>
        <button
          onClick={() => setActiveTab('billing')}
          className={`btn ${activeTab === 'billing' ? 'btn-primary' : 'btn-ghost'}`}
        >
          Invoices{invoicesError ? ' (!)' : invoices ? ` (${invoices.length})` : ''}
        </button>
        <button
          onClick={() => setActiveTab('queries')}
          className={`btn ${activeTab === 'queries' ? 'btn-primary' : 'btn-ghost'}`}
        >
          Messages
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="glass-card">
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '700' }}>Clinical Details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div><strong>Breed:</strong> {pet.breed || 'N/A'}</div>
            <div><strong>Age / Sex:</strong> {pet.age || 'N/A'} / {sexLabel(pet.sex)}</div>
            <div><strong>Weight:</strong> {pet.weight ? `${pet.weight} kg` : 'N/A'}</div>
            <div><strong>Referred By:</strong> {pet.referred_by || 'Self-referred'}</div>
          </div>

          <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--glass-border)' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Chief Complaint</h4>
            <p style={{ margin: 0, color: 'var(--brown-700)', lineHeight: '1.6' }}>
              {pet.complaint || 'No chief complaint recorded yet.'}
            </p>
          </div>

          <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--glass-border)' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Medical History</h4>
            <p style={{ margin: 0, color: 'var(--brown-700)', lineHeight: '1.6' }}>
              {pet.medical_history || 'No detailed medical history recorded yet.'}
            </p>
          </div>
        </div>
      )}

      {/* Scans & Reports Tab */}
      {activeTab === 'diagnoses' && (
        <div>
          <div className="glass-card" style={{ marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Upload Scan or Report</h3>
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
                    disabled={uploadingDiagnosis}
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
                  disabled={uploadingDiagnosis}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={uploadingDiagnosis}>
                {uploadingDiagnosis ? 'Uploading…' : 'Upload Report'}
              </button>
            </form>
          </div>

          <div className="glass-card">
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Uploaded Scans & Reports</h3>
            {diagnosesError ? (
              <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Could not load scans & reports.</span>
                <button onClick={() => refetchDiagnoses()} className="btn btn-ghost btn-sm">
                  Retry
                </button>
              </div>
            ) : !diagnoses || diagnoses.length === 0 ? (
              <p style={{ color: 'var(--brown-500)' }}>No scans or reports uploaded yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {diagnoses.map((d) => (
                  <div key={d.id} style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.8)', border: '1px solid var(--glass-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span className="badge badge-confirmed">{d.report_type_display || d.report_type}</span>
                      <span style={{ fontSize: '12px', color: 'var(--brown-500)' }}>{d.uploaded_at?.substring(0, 10) || '—'}</span>
                    </div>
                    <div>{d.notes || 'No notes'}</div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {d.file_url && (
                        <a href={d.file_url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <Icon name="paperclip" size={13} /> View File ({d.original_filename})
                        </a>
                      )}
                      {confirmDeleteId === d.id ? (
                        <>
                          <span style={{ fontSize: '13px', color: '#b71c1c', fontWeight: 600 }}>Delete this report permanently?</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteDiagnosis(d.id)}
                            className="btn btn-ghost btn-sm"
                            disabled={deletingDiagnosisId === d.id}
                            style={{ color: '#b71c1c', borderColor: 'rgba(198, 40, 40, 0.25)' }}
                          >
                            {deletingDiagnosisId === d.id ? 'Deleting…' : 'Yes, Delete'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="btn btn-ghost btn-sm"
                            disabled={deletingDiagnosisId === d.id}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDeleteDiagnosis(d.id)}
                          className="btn btn-ghost btn-sm"
                          style={{ color: '#b71c1c' }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
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
                  <label>Therapies (separate multiple with a comma)</label>
                  <input
                    className="input-glass"
                    value={therapies}
                    onChange={(e) => setTherapies(e.target.value)}
                    placeholder="e.g. Laser, Stretching, Hydrotherapy"
                    disabled={creatingPlan}
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
              <button type="submit" className="btn btn-primary" disabled={creatingPlan}>
                {creatingPlan ? 'Saving…' : 'Save Treatment Plan'}
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
                <h4 style={{ margin: 0, fontSize: '16px' }}>Plan started {friendlyDate(plan.start_date)}</h4>
                <span className={`badge badge-${(plan.status || 'unknown').toLowerCase()}`}>{humanizeStatus(plan.status) || 'Unknown'}</span>
              </div>
              <p><strong>Therapies:</strong> {plan.therapies?.join(', ') || '—'}</p>
              <p><strong>Frequency & Duration:</strong> {humanizeStatus(plan.frequency) || '—'} &bull; {humanizeStatus(plan.duration) || '—'}</p>

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
                    value={noteTextByPlan[plan.id] || ''}
                    onChange={(e) => setNoteTextByPlan((prev) => ({ ...prev, [plan.id]: e.target.value }))}
                    disabled={savingNotePlanId === plan.id}
                  />
                  <button
                    onClick={() => handleAddNote(plan.id)}
                    className="btn btn-secondary"
                    disabled={savingNotePlanId === plan.id}
                  >
                    {savingNotePlanId === plan.id ? 'Saving…' : 'Add Note'}
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
                      <td><span className={`badge badge-${(inv.payment_status || 'unknown').toLowerCase()}`}>{humanizeStatus(inv.payment_status)}</span></td>
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
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Messages with {pet?.owner_name || 'the owner'}</h3>
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
                    {m.sender_name} &bull;{' '}
                    {m.sent_at
                      ? new Date(m.sent_at).toLocaleString([], {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </div>
                  {m.message && <div>{m.message}</div>}
                  {m.attachments && m.attachments.length > 0 && (
                    <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {m.attachments.map((att) => (
                        <a
                          key={att.id}
                          href={att.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: m.sender_role === 'DOCTOR' ? '#fff' : 'var(--primary)',
                            fontSize: '12px',
                            textDecoration: 'underline',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Icon name="paperclip" size={12} /> {att.original_filename}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleSendReply} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="input-glass"
                placeholder="Write a reply..."
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                style={{ flex: 1, minWidth: '200px' }}
                disabled={sendingReply}
              />
              <input
                type="file"
                className="input-glass"
                onChange={(e) => setReplyFile(e.target.files?.[0] || null)}
                disabled={sendingReply}
                style={{ maxWidth: '220px' }}
                aria-label="Attach a file to your reply"
              />
              <button type="submit" className="btn btn-primary" disabled={sendingReply}>
                {sendingReply ? 'Sending…' : 'Send Reply'}
              </button>
            </div>
            {replyFile && (
              <div style={{ fontSize: '12px', color: 'var(--brown-600)' }}>
                Attached: {replyFile.name}{' '}
                <button
                  type="button"
                  onClick={() => setReplyFile(null)}
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '2px 8px' }}
                  disabled={sendingReply}
                >
                  Remove
                </button>
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
};
