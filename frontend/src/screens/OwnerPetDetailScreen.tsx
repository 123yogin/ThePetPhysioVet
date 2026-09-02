import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchOwnerPetDetail,
  addOwnerPetDiagnosis,
  updateOwnerPetHistory,
  fetchOwnerQueries,
  sendOwnerQueryMessage,
} from '../api/owner';
import { useFlash } from '../lib/flash';
import { Icon, IconName } from '../components/Icon';
import { humanizeStatus, petEmoji, friendlyDate } from '../lib/labels';

const REPORT_TYPES: { value: string; label: string }[] = [
  { value: 'XRAY', label: 'X-Ray' },
  { value: 'MRI', label: 'MRI Scan' },
  { value: 'CT', label: 'CT Scan' },
  { value: 'ULTRASOUND', label: 'Ultrasound' },
  { value: 'BLOOD', label: 'Blood Work' },
  { value: 'OTHER', label: 'Other' },
];

const TABS: { key: 'treatment' | 'messages' | 'about'; label: string; icon: IconName }[] = [
  { key: 'treatment', label: 'Treatment', icon: 'activity' },
  { key: 'messages', label: 'Messages & Files', icon: 'chat' },
  { key: 'about', label: 'About', icon: 'list' },
];

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const sectionHeading: React.CSSProperties = { fontSize: '18px', fontWeight: 700, color: 'var(--brown-900)' };

export const OwnerPetDetailScreen: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  // useParams gives `string | undefined`. Previously this was `Number(id)`,
  // which quietly turned a missing param into NaN and requested /NaN; an empty
  // string makes the bad case obvious instead of silently 404-ing.
  const petId = id ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addFlash } = useFlash();

  const [activeTab, setActiveTab] = useState<'treatment' | 'messages' | 'about'>('treatment');

  // Reports & Scans form state
  const [showAddDiag, setShowAddDiag] = useState(false);
  const [diagReportType, setDiagReportType] = useState('XRAY');
  const [diagNotes, setDiagNotes] = useState('');
  const [diagFile, setDiagFile] = useState<File | null>(null);

  // About / edit details form state
  const [showEditHistory, setShowEditHistory] = useState(false);
  const [medHistory, setMedHistory] = useState('');
  const [complaintText, setComplaintText] = useState('');
  const [petAge, setPetAge] = useState('');
  const [petWeight, setPetWeight] = useState('');
  const [petNotes, setPetNotes] = useState('');

  // Chat message state
  const [chatMessage, setChatMessage] = useState('');
  const [chatFile, setChatFile] = useState<File | null>(null);

  // Fetch pet detail
  const { data: pet, isLoading, isError, error, refetch: refetchPet } = useQuery({
    queryKey: ['ownerPetDetail', petId],
    queryFn: () => fetchOwnerPetDetail(petId),
    enabled: !!petId,
  });

  // Fetch chat thread
  const { data: chatThread, isError: chatError, refetch: refetchChat } = useQuery({
    queryKey: ['ownerPetQueries', petId],
    queryFn: () => fetchOwnerQueries(petId),
    enabled: !!petId,
  });

  const openEditDetails = () => {
    if (!pet) return;
    setMedHistory(pet.medical_history || '');
    setComplaintText(pet.complaint || '');
    setPetAge(String(pet.age || ''));
    setPetWeight(String(pet.weight || ''));
    setPetNotes(pet.notes || '');
    setShowEditHistory(true);
  };

  // Add Report Mutation
  const addDiagMutation = useMutation({
    mutationFn: async () => {
      if (!diagFile) {
        throw new Error('Please attach a file first.');
      }
      const fd = new FormData();
      fd.append('report_type', diagReportType);
      fd.append('notes', diagNotes);
      fd.append('file', diagFile);
      return addOwnerPetDiagnosis(petId, fd);
    },
    onSuccess: () => {
      addFlash(`Added to ${pet?.name || "your pet"}'s file.`, 'success');
      queryClient.invalidateQueries({ queryKey: ['ownerPetDetail', petId] });
      setShowAddDiag(false);
      setDiagNotes('');
      setDiagFile(null);
    },
    onError: (err: any) => {
      addFlash(err?.message || 'Failed to add this report. Please try again.', 'error');
    },
  });

  // Update Details Mutation
  const updateHistoryMutation = useMutation({
    mutationFn: async () => {
      return updateOwnerPetHistory(petId, {
        medical_history: medHistory,
        complaint: complaintText,
        age: petAge,
        weight: petWeight,
        notes: petNotes,
      });
    },
    onSuccess: () => {
      addFlash("Details updated.", 'success');
      queryClient.invalidateQueries({ queryKey: ['ownerPetDetail', petId] });
      setShowEditHistory(false);
    },
    onError: (err: any) => {
      addFlash(err?.message || 'Failed to save changes. Please try again.', 'error');
    },
  });

  // Send Chat Message Mutation
  const sendChatMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('message', chatMessage);
      if (chatFile) {
        fd.append('attachments', chatFile);
      }
      return sendOwnerQueryMessage(petId, fd);
    },
    onSuccess: () => {
      addFlash('Message sent.', 'success');
      queryClient.invalidateQueries({ queryKey: ['ownerPetQueries', petId] });
      setChatMessage('');
      setChatFile(null);
    },
    onError: (err: any) => {
      addFlash(err?.message || 'Failed to send message. Please try again.', 'error');
    },
  });

  if (isLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>
        <h3>Couldn't Load This Pet</h3>
        {error instanceof Error && error.message && (
          <p style={{ color: 'var(--brown-600)', fontSize: '13px', marginTop: '8px' }}>{error.message}</p>
        )}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '16px' }}>
          <button onClick={() => refetchPet()} className="btn btn-primary">
            Retry
          </button>
          <button onClick={() => navigate('/owner/home')} className="btn btn-secondary">
            &larr; Back to My Pets
          </button>
        </div>
      </div>
    );
  }

  if (!pet) {
    return (
      <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>
        <h3>Pet Not Found</h3>
        <button onClick={() => navigate('/owner/home')} className="btn btn-secondary" style={{ marginTop: '16px' }}>
          &larr; Back to My Pets
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Top Bar with Back Button */}
      <div style={{ marginBottom: '16px' }}>
        <button onClick={() => navigate('/owner/home')} className="btn btn-ghost btn-sm">
          &larr; Back to My Pets
        </button>
      </div>

      {/* Pet Header Card */}
      <div className="glass-card" style={{ marginBottom: '24px', padding: '24px' }}>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '20px',
              background: 'linear-gradient(135deg, var(--brown-300), var(--brown-500))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '36px',
              boxShadow: 'var(--shadow-glass)',
            }}
          >
            {petEmoji(pet.species)}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '26px', fontWeight: '800', color: 'var(--brown-900)', margin: 0 }}>
                {pet.name}
              </h1>
              <span className="badge badge-neutral">{pet.species || 'Pet'}</span>
            </div>
            <p style={{ color: 'var(--brown-700)', marginTop: '4px', fontSize: '14px' }}>
              {[pet.breed, pet.age, pet.weight ? `${pet.weight} kg` : null, pet.sex].filter(Boolean).join(' • ') || 'No details added yet'}
            </p>
            <p style={{ color: 'var(--brown-600)', fontSize: '12px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Icon name="doctor" size={12} /> Your vet: {pet.doctor_name || 'Not assigned yet'}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs Navigation — visually distinct from action buttons: an
          underline indicator, not a filled pill, so tabs never look like
          the primary/secondary action buttons inside each panel. */}
      <div
        role="tablist"
        style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '2px solid var(--glass-border)', overflowX: 'auto' }}
      >
        {TABS.map((t) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(t.key)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: active ? '3px solid var(--brown-900)' : '3px solid transparent',
                color: active ? 'var(--brown-900)' : 'var(--brown-500)',
                fontWeight: active ? 700 : 500,
                fontSize: '14px',
                padding: '10px 14px',
                marginBottom: '-2px',
                cursor: 'pointer',
                minHeight: '44px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
              }}
            >
              <Icon name={t.icon} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* TAB: TREATMENT */}
      {activeTab === 'treatment' && (
        <div>
          <h3 style={{ ...sectionHeading, marginBottom: '16px' }}>Treatment Plan</h3>
          {!pet.treatment_plans || pet.treatment_plans.length === 0 ? (
            <div className="glass-card" style={{ padding: '30px', textAlign: 'center' }}>
              <p style={{ color: 'var(--brown-600)', margin: 0 }}>
                Your vet hasn't started a treatment plan yet.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {pet.treatment_plans.map((plan, idx) => (
                <div key={plan.id} className="glass-card" style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <h4 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--brown-900)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon name="activity" /> Treatment Plan{pet.treatment_plans!.length > 1 ? ` #${idx + 1}` : ''}
                    </h4>
                    <span className={`badge badge-${(plan.status || 'unknown').toLowerCase()}`}>{humanizeStatus(plan.status)}</span>
                  </div>
                  <p style={{ color: 'var(--brown-600)', fontSize: '12px', marginTop: '4px' }}>
                    Started {friendlyDate(plan.start_date)}
                  </p>
                  <p style={{ color: 'var(--brown-800)', marginTop: '10px', fontSize: '14px' }}>
                    <strong>What's happening:</strong> {plan.therapies?.join(', ') || '—'}
                  </p>
                  <p style={{ color: 'var(--brown-700)', marginTop: '4px', fontSize: '14px' }}>
                    <strong>How often:</strong> {plan.frequency_custom || plan.frequency || '—'} &bull;{' '}
                    <strong>For how long:</strong> {plan.duration_custom || plan.duration || '—'}
                  </p>

                  {plan.progress_notes && plan.progress_notes.length > 0 && (
                    <div style={{ marginTop: '12px', background: 'rgba(255,255,255,0.6)', padding: '12px', borderRadius: '8px' }}>
                      <strong style={{ fontSize: '13px', color: 'var(--brown-900)' }}>Notes from your vet</strong>
                      {plan.progress_notes.map((note) => (
                        <div key={note.id} style={{ fontSize: '13px', color: 'var(--brown-700)', margin: '8px 0 0' }}>
                          <strong>Visit {note.session_no}:</strong> {note.notes}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: MESSAGES & FILES */}
      {activeTab === 'messages' && (
        <div>
          {/* Reports & Scans */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={sectionHeading}>Reports & Scans</h3>
              <button onClick={() => setShowAddDiag((v) => !v)} className="btn btn-secondary btn-sm">
                <Icon name="plus" /> Add a Report
              </button>
            </div>

            {showAddDiag && (
              <div className="glass-card" style={{ marginBottom: '16px', padding: '20px', border: '2px solid var(--primary)' }}>
                <h4 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--brown-900)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icon name="paperclip" /> Add a Report or Scan
                </h4>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addDiagMutation.mutate();
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                    <div className="field">
                      <label>Type *</label>
                      <select className="input-glass" value={diagReportType} onChange={(e) => setDiagReportType(e.target.value)}>
                        {REPORT_TYPES.map((rt) => (
                          <option key={rt.value} value={rt.value}>
                            {rt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>File (image or PDF) *</label>
                      <input
                        type="file"
                        className="input-glass"
                        onChange={(e) => setDiagFile(e.target.files ? e.target.files[0] : null)}
                        required
                      />
                    </div>
                  </div>

                  <div className="field" style={{ marginTop: '12px' }}>
                    <label>Notes for your vet (optional)</label>
                    <textarea
                      className="input-glass"
                      rows={2}
                      value={diagNotes}
                      onChange={(e) => setDiagNotes(e.target.value)}
                      placeholder="Anything you'd like your vet to know about this..."
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => setShowAddDiag(false)} className="btn btn-ghost btn-sm">
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={addDiagMutation.isPending}>
                      {addDiagMutation.isPending ? 'Adding...' : 'Add Report'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {!pet.diagnoses || pet.diagnoses.length === 0 ? (
              <p style={{ color: 'var(--brown-600)', fontSize: '13px' }}>No reports or scans added yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {pet.diagnoses.map((diag) => (
                  <div key={diag.id} className="glass-card" style={{ padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--brown-900)' }}>
                          {diag.original_filename || 'Report'}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--brown-600)', marginTop: '2px' }}>
                          {friendlyDate(diag.uploaded_at)}
                          {diag.size ? ` • ${formatFileSize(diag.size)}` : ''}
                        </div>
                      </div>
                      <span className="badge badge-neutral">{diag.report_type_display || diag.report_type}</span>
                    </div>

                    {diag.notes && (
                      <p style={{ color: 'var(--brown-800)', marginTop: '8px', fontSize: '13px', whiteSpace: 'pre-line' }}>
                        {diag.notes}
                      </p>
                    )}

                    {diag.file_url && (
                      <a
                        href={diag.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="table-link"
                        style={{ fontSize: '12px', marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Icon name="paperclip" size={12} /> View file
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Messages */}
          <div>
            <h3 style={{ ...sectionHeading, marginBottom: '16px' }}>Messages</h3>

            <div className="glass-card" style={{ padding: '20px', marginBottom: '20px', minHeight: '160px' }}>
              {chatError ? (
                <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Could not load your messages.</span>
                  <button onClick={() => refetchChat()} className="btn btn-ghost btn-sm">
                    Retry
                  </button>
                </div>
              ) : !chatThread?.messages || chatThread.messages.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--brown-600)', padding: '24px 0' }}>
                  No messages yet. Send your vet a message below.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {chatThread.messages.map((msg) => (
                    <div
                      key={msg.id}
                      style={{
                        alignSelf: msg.sender_role === 'OWNER' ? 'flex-end' : 'flex-start',
                        maxWidth: '80%',
                        background: msg.sender_role === 'OWNER' ? 'var(--primary)' : 'rgba(255, 255, 255, 0.9)',
                        color: msg.sender_role === 'OWNER' ? '#fff' : 'var(--brown-900)',
                        padding: '12px 16px',
                        borderRadius: '16px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                      }}
                    >
                      <div style={{ fontSize: '11px', opacity: 0.8, marginBottom: '4px', fontWeight: 600 }}>
                        {msg.sender_name} &bull; {new Date(msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.4 }}>{msg.message}</p>

                      {msg.attachments && msg.attachments.length > 0 && (
                        <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {msg.attachments.map((att) => (
                            <a
                              key={att.id}
                              href={att.url}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                color: msg.sender_role === 'OWNER' ? '#fff' : 'var(--primary)',
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
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!chatMessage.trim()) return;
                sendChatMutation.mutate();
              }}
              className="glass-card"
              style={{ padding: '16px' }}
            >
              <div className="field">
                <label className="visually-hidden" htmlFor="chat-message">Message</label>
                <textarea
                  id="chat-message"
                  className="input-glass"
                  rows={3}
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="Type a message to your vet..."
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <input
                  type="file"
                  onChange={(e) => setChatFile(e.target.files ? e.target.files[0] : null)}
                  style={{ fontSize: '12px' }}
                  aria-label="Attach a file"
                />
                <button type="submit" className="btn btn-primary btn-sm" disabled={sendChatMutation.isPending}>
                  {sendChatMutation.isPending ? 'Sending...' : 'Send Message'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB: ABOUT */}
      {activeTab === 'about' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={sectionHeading}>About {pet.name}</h3>
            <button onClick={openEditDetails} className="btn btn-secondary btn-sm">
              <Icon name="edit" /> Edit Details
            </button>
          </div>

          {showEditHistory && (
            <div className="glass-card" style={{ marginBottom: '24px', padding: '20px', border: '2px solid var(--primary)' }}>
              <h4 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--brown-900)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon name="edit" /> Edit Details
              </h4>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  updateHistoryMutation.mutate();
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                  <div className="field">
                    <label>Age</label>
                    <input
                      type="text"
                      className="input-glass"
                      value={petAge}
                      onChange={(e) => setPetAge(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Weight (kg)</label>
                    <input
                      type="text"
                      className="input-glass"
                      value={petWeight}
                      onChange={(e) => setPetWeight(e.target.value)}
                    />
                  </div>
                </div>

                <div className="field" style={{ marginTop: '12px' }}>
                  <label>What's the concern?</label>
                  <textarea
                    className="input-glass"
                    rows={2}
                    value={complaintText}
                    onChange={(e) => setComplaintText(e.target.value)}
                  />
                </div>

                <div className="field" style={{ marginTop: '12px' }}>
                  <label>Medical history (surgeries, medications, etc.)</label>
                  <textarea
                    className="input-glass"
                    rows={4}
                    value={medHistory}
                    onChange={(e) => setMedHistory(e.target.value)}
                  />
                </div>

                <div className="field" style={{ marginTop: '12px' }}>
                  <label>Anything else your vet should know</label>
                  <textarea
                    className="input-glass"
                    rows={2}
                    value={petNotes}
                    onChange={(e) => setPetNotes(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setShowEditHistory(false)} className="btn btn-ghost btn-sm">
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={updateHistoryMutation.isPending}>
                    {updateHistoryMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="glass-card" style={{ padding: '20px' }}>
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--brown-600)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Reason for Visit
              </h4>
              <p style={{ fontSize: '15px', color: 'var(--brown-900)', marginTop: '4px' }}>
                {pet.complaint || 'Nothing recorded yet.'}
              </p>
            </div>

            <div style={{ marginBottom: '16px', borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--brown-600)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Medical History
              </h4>
              <p style={{ fontSize: '15px', color: 'var(--brown-900)', marginTop: '4px', whiteSpace: 'pre-line' }}>
                {pet.medical_history || 'Nothing recorded yet.'}
              </p>
            </div>

            {pet.notes && (
              <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--brown-600)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Additional Notes
                </h4>
                <p style={{ fontSize: '14px', color: 'var(--brown-800)', marginTop: '4px' }}>
                  {pet.notes}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
