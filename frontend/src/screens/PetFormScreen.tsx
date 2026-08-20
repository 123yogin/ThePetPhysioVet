import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPet } from '../api/pets';
import { useFlash } from '../lib/flash';

export const PetFormScreen: React.FC = () => {
  const navigate = useNavigate();
  const { addFlash } = useFlash();

  const [name, setName] = useState('');
  const [species, setSpecies] = useState('Dog');
  const [breed, setBreed] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('M');
  const [weight, setWeight] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [complaint, setComplaint] = useState('');
  const [referredBy, setReferredBy] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !ownerName || !ownerPhone) {
      return addFlash('Please fill in Pet Name, Owner Name, and Owner Phone', 'error');
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('name', name);
    formData.append('species', species);
    formData.append('pet_type', species);
    formData.append('breed', breed);
    formData.append('age', age);
    formData.append('sex', sex);
    formData.append('weight', weight);
    formData.append('owner_name', ownerName);
    formData.append('owner_phone', ownerPhone);
    formData.append('owner_email', ownerEmail);
    formData.append('complaint', complaint);
    formData.append('referred_by', referredBy);

    try {
      const newPet = await createPet(formData);
      addFlash(`Patient record created for ${newPet.name}`, 'success');
      navigate(`/patients/${newPet.id}`);
    } catch (err: any) {
      addFlash(err.message || 'Failed to create patient', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
      <h1 className="page-title">Register New Patient</h1>
      <p className="page-sub">Enter pet physical details and owner contact details</p>

      <form onSubmit={handleSubmit} className="glass-card">
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Pet Information</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div className="field">
            <label>Pet Name *</label>
            <input
              type="text"
              className="input-glass"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Max"
            />
          </div>
          <div className="field">
            <label>Species / Pet Type</label>
            <select className="input-glass" value={species} onChange={(e) => setSpecies(e.target.value)}>
              <option value="Dog">Dog</option>
              <option value="Cat">Cat</option>
              <option value="Horse">Horse</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="field">
            <label>Breed</label>
            <input
              type="text"
              className="input-glass"
              value={breed}
              onChange={(e) => setBreed(e.target.value)}
              placeholder="e.g. Golden Retriever"
            />
          </div>
          <div className="field">
            <label>Age</label>
            <input
              type="text"
              className="input-glass"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="e.g. 3 years"
            />
          </div>
          <div className="field">
            <label>Sex</label>
            <select className="input-glass" value={sex} onChange={(e) => setSex(e.target.value)}>
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="MN">Male Neutered</option>
              <option value="FS">Female Spayed</option>
            </select>
          </div>
          <div className="field">
            <label>Weight (kg)</label>
            <input
              type="number"
              step="0.1"
              className="input-glass"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="e.g. 28.5"
            />
          </div>
        </div>

        <h3 style={{ margin: '24px 0 16px 0', fontSize: '16px', borderTop: '1px solid var(--glass-border)', paddingTop: '20px' }}>
          Owner Details
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div className="field">
            <label>Owner Full Name *</label>
            <input
              type="text"
              className="input-glass"
              required
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="e.g. Sarah Johnson"
            />
          </div>
          <div className="field">
            <label>Owner Phone Number *</label>
            <input
              type="tel"
              className="input-glass"
              required
              value={ownerPhone}
              onChange={(e) => setOwnerPhone(e.target.value)}
              placeholder="e.g. +91 98765 43210"
            />
          </div>
          <div className="field" style={{ gridColumn: 'span 2' }}>
            <label>Owner Email</label>
            <input
              type="email"
              className="input-glass"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              placeholder="sarah@example.com"
            />
          </div>
        </div>

        <h3 style={{ margin: '24px 0 16px 0', fontSize: '16px', borderTop: '1px solid var(--glass-border)', paddingTop: '20px' }}>
          Clinical Intake
        </h3>
        <div className="field">
          <label>Chief Complaint / Presenting Problem</label>
          <textarea
            className="input-glass"
            rows={3}
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            placeholder="Limping on hind leg after CCL surgery, spinal stiffness..."
          />
        </div>
        <div className="field">
          <label>Referred By Vet / Clinic</label>
          <input
            type="text"
            className="input-glass"
            value={referredBy}
            onChange={(e) => setReferredBy(e.target.value)}
            placeholder="Dr. Mehta Vet Care Clinic"
          />
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Saving Patient...' : 'Register Patient'}
          </button>
          <button type="button" onClick={() => navigate('/patients')} className="btn btn-ghost">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};
