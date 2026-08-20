import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchOwnerPetDetail,
  addOwnerPetDiagnosis,
  updateOwnerPetHistory,
  fetchOwnerQueries,
  sendOwnerQueryMessage,
  createOwnerAppointment,
} from '../api/owner';
import { useFlash } from '../lib/flash';

export const OwnerPetDetailScreen: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const petId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addFlash } = useFlash();

  const [activeTab, setActiveTab] = useState<'diagnoses' | 'history' | 'plans' | 'chat' | 'book'>('diagnoses');

  // Diagnosis Modal / Form state
  const [showAddDiag, setShowAddDiag] = useState(false);
  const [diagTitle, setDiagTitle] = useState('');
  const [diagFindings, setDiagFindings] = useState('');
  const [diagSeverity, setDiagSeverity] = useState('MODERATE');
  const [diagTags, setDiagTags] = useState('Scan, Report');
  const [diagFile, setDiagFile] = useState<File | null>(null);

  // History Edit Modal state
  const [showEditHistory, setShowEditHistory] = useState(false);
  const [medHistory, setMedHistory] = useState('');
  const [complaintText, setComplaintText] = useState('');
  const [petAge, setPetAge] = useState('');
  const [petWeight, setPetWeight] = useState('');
  const [petNotes, setPetNotes] = useState('');

  // Chat message state
  const [chatMessage, setChatMessage] = useState('');
  const [chatFile, setChatFile] = useState<File | null>(null);

  // Appointment booking state
  const [apptDate, setApptDate] = useState(new Date().toISOString().slice(0, 10));
  const [apptTime, setApptTime] = useState('10:00');
  const [visitType, setVisitType] = useState('Follow-up Physical Rehab');
  const [reasonNotes, setReasonNotes] = useState('');

  // Fetch pet detail
  const { data: pet, isLoading, isError, refetch: refetchPet } = useQuery({
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

  // Add Diagnosis Mutation
  const addDiagMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('title', diagTitle);
      fd.append('findings', diagFindings);
      fd.append('severity', diagSeverity);
      fd.append('tags', diagTags);
      if (diagFile) {
        fd.append('attachments', diagFile);
      }
      return addOwnerPetDiagnosis(petId, fd);
    },
    onSuccess: () => {
      addFlash('Diagnostic report uploaded successfully! Your vet has been notified.', 'success');
      queryClient.invalidateQueries({ queryKey: ['ownerPetDetail', petId] });
      setShowAddDiag(false);
      setDiagTitle('');
      setDiagFindings('');
      setDiagFile(null);
    },
    onError: () => {
      addFlash('Failed to upload diagnostic report.', 'error');
    },
  });

  // Update History Mutation
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
      addFlash('Pet medical history updated successfully!', 'success');
      queryClient.invalidateQueries({ queryKey: ['ownerPetDetail', petId] });
      setShowEditHistory(false);
    },
    onError: () => {
      addFlash('Failed to update medical history.', 'error');
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
      addFlash('Message sent to your vet!', 'success');
      queryClient.invalidateQueries({ queryKey: ['ownerPetQueries', petId] });
      setChatMessage('');
      setChatFile(null);
    },
    onError: () => {
      addFlash('Failed to send message.', 'error');
    },
  });

  // Book Appointment Mutation
  const bookApptMutation = useMutation({
    mutationFn: async () => {
      return createOwnerAppointment({
        pet_id: petId,
        date: apptDate,
        time: apptTime,
        visit_type: visitType,
        reason_notes: reasonNotes,
      });
    },
    onSuccess: () => {
      addFlash(`📅 Therapy appointment booked for ${apptDate} with your vet!`, 'success');
      setReasonNotes('');
      setActiveTab('diagnoses');
    },
    onError: () => {
      addFlash('Failed to book appointment.', 'error');
    },
  });

  if (isLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p>Loading care records...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>
        <h3>Could Not Load This Pet's Record</h3>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '16px' }}>
          <button onClick={() => refetchPet()} className="btn btn-primary">
            Retry
          </button>
          <button onClick={() => navigate('/owner/home')} className="btn btn-secondary">
            &larr; Return to My Pets
          </button>
        </div>
      </div>
    );
  }

  if (!pet) {
    return (
      <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>
        <h3>Patient Record Not Found</h3>
        <button onClick={() => navigate('/owner/home')} className="btn btn-secondary" style={{ marginTop: '16px' }}>
          &larr; Return to My Pets
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
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
              🐕
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1 style={{ fontSize: '26px', fontWeight: '800', color: 'var(--brown-900)', margin: 0 }}>
                  {pet.name}
                </h1>
                <span className="badge badge-success">{pet.species || 'Dog'}</span>
              </div>
              <p style={{ color: 'var(--brown-700)', marginTop: '4px', fontSize: '14px' }}>
                <strong>Breed:</strong> {pet.breed || 'Crossbreed'} &bull; <strong>Age:</strong> {pet.age || 'N/A'} &bull;{' '}
                <strong>Weight:</strong> {pet.weight ? `${pet.weight} kg` : 'N/A'} &bull; <strong>Sex:</strong> {pet.sex || 'N/A'}
              </p>
              <p style={{ color: 'var(--brown-600)', fontSize: '12px', marginTop: '4px' }}>
                👨‍⚕️ <strong>Attending Specialist:</strong> your vet
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => {
                setMedHistory(pet.medical_history || '');
                setComplaintText(pet.complaint || '');
                setPetAge(String(pet.age || ''));
                setPetWeight(String(pet.weight || ''));
                setPetNotes(pet.notes || '');
                setShowEditHistory(true);
              }}
              className="btn btn-secondary btn-sm"
            >
              ✏️ Edit Medical History
            </button>
            <button onClick={() => setShowAddDiag(true)} className="btn btn-primary btn-sm">
              ➕ Upload Diagnosis Report
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '2px solid var(--glass-border)', paddingBottom: '8px', overflowX: 'auto' }}>
        <button
          className={`btn ${activeTab === 'diagnoses' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('diagnoses')}
          style={{ padding: '8px 16px', fontSize: '14px' }}
        >
          🩺 Diagnosis Reports ({pet.diagnoses?.length || 0})
        </button>
        <button
          className={`btn ${activeTab === 'history' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('history')}
          style={{ padding: '8px 16px', fontSize: '14px' }}
        >
          📋 Medical History & Notes
        </button>
        <button
          className={`btn ${activeTab === 'plans' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('plans')}
          style={{ padding: '8px 16px', fontSize: '14px' }}
        >
          🏋️‍♂️ Physical Therapy Plans ({pet.treatment_plans?.length || 0})
        </button>
        <button
          className={`btn ${activeTab === 'chat' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('chat')}
          style={{ padding: '8px 16px', fontSize: '14px' }}
        >
          💬 Message your vet
        </button>
        <button
          className={`btn ${activeTab === 'book' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('book')}
          style={{ padding: '8px 16px', fontSize: '14px' }}
        >
          📅 Book Session
        </button>
      </div>

      {/* TAB 1: DIAGNOSES & REPORTS */}
      {activeTab === 'diagnoses' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--brown-900)' }}>
              Diagnostic Records, Scans & Reports
            </h3>
            <button onClick={() => setShowAddDiag(true)} className="btn btn-primary btn-sm">
              ➕ Add Diagnosis Report / Scan
            </button>
          </div>

          {/* Modal / Form to Upload Diagnosis */}
          {showAddDiag && (
            <div className="glass-card" style={{ marginBottom: '24px', padding: '20px', border: '2px solid var(--primary)' }}>
              <h4 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--brown-900)', marginBottom: '12px' }}>
                📁 Upload New Diagnostic Report or Scan
              </h4>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addDiagMutation.mutate();
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  <div className="field">
                    <label>Report Title *</label>
                    <input
                      type="text"
                      className="input-glass"
                      value={diagTitle}
                      onChange={(e) => setDiagTitle(e.target.value)}
                      placeholder="e.g. Hip X-Ray Scan or Blood Test"
                      required
                    />
                  </div>
                  <div className="field">
                    <label>Severity Level</label>
                    <select className="input-glass" value={diagSeverity} onChange={(e) => setDiagSeverity(e.target.value)}>
                      <option value="MILD">Mild</option>
                      <option value="MODERATE">Moderate</option>
                      <option value="SEVERE">Severe</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Tags / Category</label>
                    <input
                      type="text"
                      className="input-glass"
                      value={diagTags}
                      onChange={(e) => setDiagTags(e.target.value)}
                      placeholder="e.g. X-Ray, Scan, Lab Report"
                    />
                  </div>
                </div>

                <div className="field" style={{ marginTop: '12px' }}>
                  <label>Findings / Report Details</label>
                  <textarea
                    className="input-glass"
                    rows={3}
                    value={diagFindings}
                    onChange={(e) => setDiagFindings(e.target.value)}
                    placeholder="Enter diagnostic summary, radiologist findings, or notes..."
                  />
                </div>

                <div className="field" style={{ marginTop: '12px' }}>
                  <label>Attach Scan / Report Document (Image or PDF)</label>
                  <input
                    type="file"
                    className="input-glass"
                    onChange={(e) => setDiagFile(e.target.files ? e.target.files[0] : null)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setShowAddDiag(false)} className="btn btn-ghost btn-sm">
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={addDiagMutation.isPending}>
                    {addDiagMutation.isPending ? 'Uploading...' : 'Upload & Link to Pet File'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {!pet.diagnoses || pet.diagnoses.length === 0 ? (
            <div className="glass-card" style={{ padding: '30px', textAlign: 'center' }}>
              <p style={{ color: 'var(--brown-600)', marginBottom: '12px' }}>No diagnostic records or scans uploaded yet.</p>
              <button onClick={() => setShowAddDiag(true)} className="btn btn-secondary btn-sm">
                ➕ Upload First Report
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {pet.diagnoses.map((diag: any) => (
                <div key={diag.id} className="glass-card" style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h4 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--brown-900)', margin: 0 }}>
                        {diag.title}
                      </h4>
                      <p style={{ fontSize: '12px', color: 'var(--brown-600)', marginTop: '2px' }}>
                        📅 Date: {diag.date}
                      </p>
                    </div>
                    <span
                      className={`badge ${
                        diag.severity === 'SEVERE'
                          ? 'badge-danger'
                          : diag.severity === 'MILD'
                          ? 'badge-success'
                          : 'badge-warning'
                      }`}
                    >
                      {diag.severity || 'MODERATE'}
                    </span>
                  </div>

                  <p style={{ color: 'var(--brown-800)', marginTop: '10px', fontSize: '14px', whiteSpace: 'pre-line' }}>
                    {diag.findings || diag.description}
                  </p>

                  {/* Attachments list */}
                  {diag.attachments && diag.attachments.length > 0 && (
                    <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {diag.attachments.map((att: any) => (
                        <a
                          key={att.id}
                          href={att.url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '12px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          📎 {att.original_filename || 'View Attached Report'}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MEDICAL HISTORY & PROFILE */}
      {activeTab === 'history' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--brown-900)' }}>
              Medical History & Clinical Background
            </h3>
            <button
              onClick={() => {
                setMedHistory(pet.medical_history || '');
                setComplaintText(pet.complaint || '');
                setPetAge(String(pet.age || ''));
                setPetWeight(String(pet.weight || ''));
                setPetNotes(pet.notes || '');
                setShowEditHistory(true);
              }}
              className="btn btn-secondary btn-sm"
            >
              ✏️ Update Details
            </button>
          </div>

          {showEditHistory && (
            <div className="glass-card" style={{ marginBottom: '24px', padding: '20px', border: '2px solid var(--primary)' }}>
              <h4 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--brown-900)', marginBottom: '12px' }}>
                ✏️ Update Medical History & Profile
              </h4>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  updateHistoryMutation.mutate();
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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
                  <label>Primary Mobility Complaint / Chief Issue</label>
                  <textarea
                    className="input-glass"
                    rows={2}
                    value={complaintText}
                    onChange={(e) => setComplaintText(e.target.value)}
                  />
                </div>

                <div className="field" style={{ marginTop: '12px' }}>
                  <label>Full Medical History (Surgeries, Previous Treatments, Medications)</label>
                  <textarea
                    className="input-glass"
                    rows={4}
                    value={medHistory}
                    onChange={(e) => setMedHistory(e.target.value)}
                  />
                </div>

                <div className="field" style={{ marginTop: '12px' }}>
                  <label>Additional Care Notes for your vet</label>
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
                    {updateHistoryMutation.isPending ? 'Saving...' : 'Save History Update'}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="glass-card" style={{ padding: '20px' }}>
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--brown-600)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Presenting Complaint / Mobility Issue
              </h4>
              <p style={{ fontSize: '15px', color: 'var(--brown-900)', marginTop: '4px' }}>
                {pet.complaint || 'No presenting complaint recorded.'}
              </p>
            </div>

            <div style={{ marginBottom: '16px', borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--brown-600)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Medical History & Surgical Background
              </h4>
              <p style={{ fontSize: '15px', color: 'var(--brown-900)', marginTop: '4px', whiteSpace: 'pre-line' }}>
                {pet.medical_history || 'No prior medical history entered yet.'}
              </p>
            </div>

            {pet.notes && (
              <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--brown-600)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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

      {/* TAB 3: TREATMENT PLANS */}
      {activeTab === 'plans' && (
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--brown-900)', marginBottom: '16px' }}>
            Prescribed Physical Therapy Plans & Exercises
          </h3>
          {!pet.treatment_plans || pet.treatment_plans.length === 0 ? (
            <div className="glass-card" style={{ padding: '30px', textAlign: 'center' }}>
              <p style={{ color: 'var(--brown-600)' }}>
                Your vet will prescribe personalized hydrotherapy, laser protocols, or home exercises following assessment.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {pet.treatment_plans.map((plan: any) => (
                <div key={plan.id} className="glass-card" style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--brown-900)', margin: 0 }}>
                      🏋️‍♂️ {plan.title || 'Rehabilitation Plan'}
                    </h4>
                    <span className="badge badge-success">{plan.status || 'ACTIVE'}</span>
                  </div>
                  <p style={{ color: 'var(--brown-800)', marginTop: '8px', fontSize: '14px' }}>
                    {plan.description || plan.goal}
                  </p>

                  {plan.protocols && (
                    <div style={{ marginTop: '12px', background: 'rgba(255,255,255,0.6)', padding: '12px', borderRadius: '8px' }}>
                      <strong style={{ fontSize: '13px', color: 'var(--brown-900)' }}>Prescribed Modalities:</strong>
                      <p style={{ fontSize: '13px', color: 'var(--brown-700)', margin: '4px 0 0' }}>{plan.protocols}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CHAT WITH DR. DHANVI PATEL */}
      {activeTab === 'chat' && (
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--brown-900)', marginBottom: '16px' }}>
            💬 Direct Message your vet
          </h3>

          <div className="glass-card" style={{ padding: '20px', marginBottom: '20px', minHeight: '200px' }}>
            {chatError ? (
              <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Could not load your message history.</span>
                <button onClick={() => refetchChat()} className="btn btn-ghost btn-sm">
                  Retry
                </button>
              </div>
            ) : !chatThread?.messages || chatThread.messages.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--brown-600)', padding: '30px 0' }}>
                No message history yet. Send a query or upload an update to your vet below!
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {chatThread.messages.map((msg: any) => (
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
                        {msg.attachments.map((att: any) => (
                          <a
                            key={att.id}
                            href={att.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              color: msg.sender_role === 'OWNER' ? '#fff' : 'var(--primary)',
                              fontSize: '12px',
                              textDecoration: 'underline',
                            }}
                          >
                            📎 {att.original_filename}
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
              <textarea
                className="input-glass"
                rows={3}
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder="Ask your vet a question regarding recovery, symptoms or care..."
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
              <input
                type="file"
                onChange={(e) => setChatFile(e.target.files ? e.target.files[0] : null)}
                style={{ fontSize: '12px' }}
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={sendChatMutation.isPending}>
                {sendChatMutation.isPending ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 5: BOOK APPOINTMENT */}
      {activeTab === 'book' && (
        <div className="glass-card" style={{ padding: '24px', maxWidth: '600px', margin: '0 auto' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--brown-900)', marginBottom: '16px' }}>
            📅 Book Therapy Appointment for {pet.name}
          </h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              bookApptMutation.mutate();
            }}
          >
            <div className="field">
              <label>Date *</label>
              <input
                type="date"
                className="input-glass"
                value={apptDate}
                onChange={(e) => setApptDate(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label>Time *</label>
              <input
                type="time"
                className="input-glass"
                value={apptTime}
                onChange={(e) => setApptTime(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label>Visit / Therapy Type</label>
              <select className="input-glass" value={visitType} onChange={(e) => setVisitType(e.target.value)}>
                <option value="Initial Assessment">Initial Physical Assessment</option>
                <option value="Hydrotherapy Session">Hydrotherapy Session</option>
                <option value="Laser Therapy Protocol">Laser Therapy Protocol</option>
                <option value="Follow-up Physical Rehab">Follow-up Physical Rehab</option>
              </select>
            </div>

            <div className="field">
              <label>Reason / Notes for your vet</label>
              <textarea
                className="input-glass"
                rows={3}
                value={reasonNotes}
                onChange={(e) => setReasonNotes(e.target.value)}
                placeholder="Mention any stiffness or specific focus area..."
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '16px' }}
              disabled={bookApptMutation.isPending}
            >
              {bookApptMutation.isPending ? 'Booking...' : 'Confirm Therapy Session'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
