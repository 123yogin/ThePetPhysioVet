import React, { useEffect, useState } from 'react';
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

  const GST_RATE = 0.18;

  const [petId, setPetId] = useState(defaultPetId);
  const [items, setItems] = useState([{ description: '', quantity: 1, unit_price: 0 }]);
  const [taxOverridden, setTaxOverridden] = useState(false);
  const [tax, setTax] = useState(0);
  const [paymentMode, setPaymentMode] = useState('post_treatment');
  const [loading, setLoading] = useState(false);

  const subtotal = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0), 0);
  const computedTax = Math.round(subtotal * GST_RATE * 100) / 100;

  // Recompute tax automatically as line items change, unless the doctor has
  // explicitly chosen to override the auto-calculated GST amount.
  useEffect(() => {
    if (!taxOverridden) {
      setTax(computedTax);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computedTax, taxOverridden]);

  const total = subtotal + (Number(tax) || 0);

  const { data: pets, isError: petsError, refetch: refetchPets } = useQuery({
    queryKey: ['pets'],
    queryFn: () => fetchPets(),
  });

  const handleAddItem = () => {
    setItems((prev) => [...prev, { description: '', quantity: 1, unit_price: 0 }]);
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
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 44px', gap: '8px', marginBottom: '8px' }}>
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

        <div className="field">
          <label>Tax Amount (₹ GST @ 18%)</label>
          <input
            type="number"
            className="input-glass"
            value={tax}
            readOnly={!taxOverridden}
            disabled={!taxOverridden}
            onChange={(e) => setTax(Number(e.target.value))}
            style={!taxOverridden ? { opacity: 0.75 } : undefined}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', fontSize: '13px', fontWeight: 'normal' }}>
            <input
              type="checkbox"
              checked={taxOverridden}
              onChange={(e) => {
                setTaxOverridden(e.target.checked);
                if (!e.target.checked) setTax(computedTax);
              }}
              style={{ width: 'auto' }}
            />
            Override auto-calculated GST amount
          </label>
        </div>

        <div className="glass-card" style={{ marginTop: '16px', padding: '16px', background: 'rgba(255,255,255,0.7)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
            <span>Subtotal</span>
            <strong>₹{subtotal.toFixed(2)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
            <span>Tax (GST){taxOverridden ? ' — overridden' : ''}</span>
            <strong>₹{(Number(tax) || 0).toFixed(2)}</strong>
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
