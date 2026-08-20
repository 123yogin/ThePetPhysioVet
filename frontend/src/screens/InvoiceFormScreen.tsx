import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createInvoice } from '../api/billing';
import { fetchPets } from '../api/pets';
import { useFlash } from '../lib/flash';

export const InvoiceFormScreen: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultPetId = searchParams.get('pet') || '';
  const { addFlash } = useFlash();

  const [petId, setPetId] = useState(defaultPetId);
  const [items, setItems] = useState([
    { description: 'Physio Assessment & Therapy Session', quantity: 1, unit_price: 1500 },
  ]);
  const [tax, setTax] = useState(270);
  const [paymentMode, setPaymentMode] = useState('post_treatment');
  const [loading, setLoading] = useState(false);

  const { data: pets, isError: petsError, refetch: refetchPets } = useQuery({
    queryKey: ['pets'],
    queryFn: () => fetchPets(),
  });

  const handleAddItem = () => {
    setItems((prev) => [...prev, { description: '', quantity: 1, unit_price: 1000 }]);
  };

  const handleItemChange = (index: number, field: string, val: any) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: val };
      return next;
    });
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!petId) return addFlash('Please select a patient', 'error');

    setLoading(true);
    try {
      const inv = await createInvoice({
        pet_id: Number(petId),
        line_items: items,
        tax: Number(tax),
        payment_mode: paymentMode,
      });
      addFlash(`Invoice ${inv.invoice_no} created`, 'success');
      navigate(`/invoices/${inv.id}`);
    } catch (err: any) {
      addFlash(err.message || 'Failed to create invoice', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
      <h1 className="page-title">Generate Invoice</h1>
      <p className="page-sub">Create billing statement for therapy consultations & sessions</p>

      <form onSubmit={handleSubmit} className="glass-card">
        <div className="field">
          <label>Patient *</label>
          <select className="input-glass" value={petId} onChange={(e) => setPetId(e.target.value)} required>
            <option value="">Select Patient...</option>
            {pets?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.owner_name})
              </option>
            ))}
          </select>
          {petsError && (
            <div className="alert alert-danger" style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Could not load the patient list.</span>
              <button type="button" onClick={() => refetchPets()} className="btn btn-ghost btn-sm">
                Retry
              </button>
            </div>
          )}
        </div>

        <div className="field">
          <label>Billing / Payment Model</label>
          <select className="input-glass" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
            <option value="post_treatment">Post-Treatment (Pay after each visit)</option>
            <option value="pre_payment">Pre-Payment Advance</option>
            <option value="package">Package / Multi-session Pass</option>
          </select>
        </div>

        <h3 style={{ margin: '20px 0 12px 0', fontSize: '16px' }}>Line Items</h3>
        {items.map((item, idx) => (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 40px', gap: '8px', marginBottom: '8px' }}>
            <input
              type="text"
              className="input-glass"
              placeholder="Description"
              value={item.description}
              onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
              required
            />
            <input
              type="number"
              className="input-glass"
              placeholder="Qty"
              value={item.quantity}
              onChange={(e) => handleItemChange(idx, 'quantity', Number(e.target.value))}
              required
            />
            <input
              type="number"
              className="input-glass"
              placeholder="Price (₹)"
              value={item.unit_price}
              onChange={(e) => handleItemChange(idx, 'unit_price', Number(e.target.value))}
              required
            />
            {items.length > 1 && (
              <button type="button" onClick={() => handleRemoveItem(idx)} className="btn btn-ghost btn-sm" style={{ color: '#b71c1c' }}>
                ✕
              </button>
            )}
          </div>
        ))}

        <button type="button" onClick={handleAddItem} className="btn btn-ghost btn-sm" style={{ marginTop: '8px', marginBottom: '20px' }}>
          + Add Line Item
        </button>

        <div className="field">
          <label>Tax Amount (₹ GST)</label>
          <input
            type="number"
            className="input-glass"
            value={tax}
            onChange={(e) => setTax(Number(e.target.value))}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Generating...' : 'Save & Issue Invoice'}
          </button>
          <button type="button" onClick={() => navigate('/invoices')} className="btn btn-ghost">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};
