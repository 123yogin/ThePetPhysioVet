import React, { useState } from 'react';
import { Icon } from '../components/Icon';
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

  // GST is per line, not per invoice. A flat 18% was applied to everything,
  // including the clinical services that Entry 46 of Notification 12/2017-CTR
  // exempts, and the resulting figure was sent to the server and stored
  // verbatim. The server now computes tax from these rates; what follows is a
  // preview of that, not the source of truth.
  const TAX_RATES = [
    { value: 0, label: 'Nil — clinical service' },
    { value: 5, label: '5% — medicines' },
    { value: 12, label: '12%' },
    { value: 18, label: '18% — grooming, boarding' },
  ];

  const [petId, setPetId] = useState(defaultPetId);
  const [items, setItems] = useState([{ description: '', quantity: 1, unit_price: 0, tax_rate: 0 }]);
  const [paymentMode, setPaymentMode] = useState('post_treatment');
  const [loading, setLoading] = useState(false);

  const lineAmount = (item: any) => (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
  const subtotal = items.reduce((sum, item) => sum + lineAmount(item), 0);
  const tax = items.reduce(
    (sum, item) => sum + Math.round(lineAmount(item) * (Number(item.tax_rate) || 0)) / 100,
    0,
  );

  const total = subtotal + (Number(tax) || 0);

  const { data: pets, isError: petsError, refetch: refetchPets } = useQuery({
    queryKey: ['pets'],
    queryFn: () => fetchPets(),
  });

  const handleAddItem = () => {
    setItems((prev) => [...prev, { description: '', quantity: 1, unit_price: 0, tax_rate: 0 }]);
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
        pet_id: petId,
        line_items: items,
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
      <h1 className="page-title">New Invoice</h1>
      <p className="page-sub">Bill an owner for a visit or a course of treatment</p>

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
          <label>How is this being paid?</label>
          <select className="input-glass" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
            <option value="post_treatment">Pay after each visit</option>
            <option value="pre_payment">Paid in advance</option>
            <option value="package">Part of a multi-session package</option>
          </select>
        </div>

        <h3 style={{ margin: '20px 0 12px 0', fontSize: '16px' }}>Line Items</h3>
        {items.map((item, idx) => (
          <div key={idx} className="invoice-line" style={{ marginBottom: '8px' }}>
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
            <select
              className="input-glass"
              value={item.tax_rate ?? 0}
              onChange={(e) => handleItemChange(idx, 'tax_rate', Number(e.target.value))}
              aria-label={`GST rate for line item ${idx + 1}`}
            >
              {TAX_RATES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => handleRemoveItem(idx)}
                className="btn btn-ghost btn-sm"
                style={{ color: '#b71c1c', padding: '6px' }}
                aria-label={`Remove line item ${idx + 1}`}
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        ))}

        <button type="button" onClick={handleAddItem} className="btn btn-ghost btn-sm" style={{ marginTop: '8px', marginBottom: '20px' }}>
          + Add Line Item
        </button>

        <div className="glass-card" style={{ marginTop: '16px', padding: '16px', background: 'rgba(255,255,255,0.7)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
            <span>Subtotal</span>
            <strong>₹{subtotal.toFixed(2)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
            <span>GST{tax === 0 ? ' — exempt' : ''}</span>
            <strong>₹{tax.toFixed(2)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0 0', borderTop: '1px solid var(--glass-border)', marginTop: '8px', fontSize: '16px' }}>
            <span>Total</span>
            <strong>₹{total.toFixed(2)}</strong>
          </div>
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
