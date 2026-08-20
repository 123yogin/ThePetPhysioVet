import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchOwnerInvoices } from '../api/owner';

export const OwnerBillingScreen: React.FC = () => {
  const { data: invoices, isLoading, isError, refetch } = useQuery({
    queryKey: ['ownerInvoices'],
    queryFn: fetchOwnerInvoices,
  });

  return (
    <div>
      <h1 className="page-title">My Invoices & Payments</h1>
      <p className="page-sub">Review veterinary therapy statements and payment history</p>

      {isError && (
        <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Could not load your invoices.</span>
          <button onClick={() => refetch()} className="btn btn-ghost btn-sm">
            Retry
          </button>
        </div>
      )}

      {isLoading ? (
        <p>Loading invoices...</p>
      ) : isError ? null : !invoices || invoices.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ color: 'var(--brown-500)' }}>No invoices issued yet.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Pet</th>
                <th>Date</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.invoice_no}</td>
                  <td>{inv.pet_name || '—'}</td>
                  <td>{inv.created_at?.substring(0, 10) || '—'}</td>
                  <td>₹{inv.total ?? '—'}</td>
                  <td><span className="badge badge-confirmed">{inv.payment_status || 'Unknown'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
