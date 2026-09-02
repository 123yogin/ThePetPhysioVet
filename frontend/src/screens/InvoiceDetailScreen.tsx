import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchInvoiceDetail, addPayment } from '../api/billing';
import { useFlash } from '../lib/flash';
import { humanizeStatus } from '../lib/labels';

export const InvoiceDetailScreen: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  // useParams gives `string | undefined`. Previously this was `Number(id)`,
  // which quietly turned a missing param into NaN and requested /NaN; an empty
  // string makes the bad case obvious instead of silently 404-ing.
  const invoiceId = id ?? '';
  const { addFlash } = useFlash();

  const [paymentAmount, setPaymentAmount] = useState('');
  const [refNo, setRefNo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: inv, isLoading, isError, refetch } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => fetchInvoiceDetail(invoiceId),
    enabled: !!invoiceId,
  });

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentAmount || Number(paymentAmount) <= 0) {
      return addFlash('Please enter a valid payment amount', 'error');
    }
    setSubmitting(true);
    try {
      await addPayment(invoiceId, {
        amount_paid: Number(paymentAmount),
        gateway_ref: refNo || 'CASH',
      });
      addFlash('Payment recorded successfully', 'success');
      setPaymentAmount('');
      setRefNo('');
      refetch();
    } catch (err: any) {
      addFlash(err.message || 'Failed to record payment', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <p>Loading invoice details...</p>;

  if (isError) {
    return (
      <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Could not load this invoice.</span>
        <button onClick={() => refetch()} className="btn btn-ghost btn-sm">
          Retry
        </button>
      </div>
    );
  }

  if (!inv) return <p>Invoice not found.</p>;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <Link to="/invoices" className="btn btn-ghost btn-sm" style={{ marginBottom: '16px' }}>
        &larr; Back to Invoices
      </Link>

      <div className="glass-card" style={{ padding: '36px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <h1 className="page-title" style={{ margin: 0 }}>{inv.invoice_no}</h1>
            <p style={{ color: 'var(--brown-500)', margin: '4px 0 0 0' }}>
              Patient: <strong>{inv.pet_name}</strong>
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className={`badge badge-${(inv.payment_status || 'unknown').toLowerCase()}`}>
              {humanizeStatus(inv.payment_status)}
            </span>
            <div style={{ fontSize: '13px', color: 'var(--brown-500)', marginTop: '4px' }}>
              Date: {inv.created_at?.substring(0, 10) || '—'}
            </div>
          </div>
        </div>

        <div className="table-wrap" style={{ marginBottom: '24px' }}>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.line_items?.map((item, i) => (
                <tr key={i}>
                  <td>{item.description}</td>
                  <td>{item.quantity}</td>
                  <td>₹{item.unit_price}</td>
                  <td style={{ fontWeight: 600 }}>₹{item.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
          <div style={{ width: '260px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span>Subtotal:</span>
              <span>₹{inv.subtotal ?? '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span>Tax / GST:</span>
              <span>₹{inv.tax ?? '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '2px solid var(--brown-900)', fontWeight: 800, fontSize: '18px' }}>
              <span>Total:</span>
              <span>₹{inv.total ?? '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: 'var(--brown-700)', fontSize: '14px' }}>
              <span>Paid:</span>
              <span>₹{inv.amount_paid ?? '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: Number(inv.balance_due) > 0 ? '#b71c1c' : '#1b5e20', fontWeight: 700 }}>
              <span>Balance Due:</span>
              <span>₹{inv.balance_due ?? '—'}</span>
            </div>
          </div>
        </div>

        {Number(inv.balance_due) > 0 && (
          <div style={{ paddingTop: '20px', borderTop: '1px solid var(--glass-border)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Record Payment</h3>
            <form onSubmit={handleAddPayment} style={{ display: 'flex', gap: '12px' }}>
              <input
                type="number"
                step="0.01"
                className="input-glass"
                placeholder="Amount Paid (₹)"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                required
              />
              <input
                type="text"
                className="input-glass"
                placeholder="Ref / UPI ID / Cash"
                value={refNo}
                onChange={(e) => setRefNo(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                Record Payment
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
