import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchInvoices } from '../api/billing';

export const InvoiceListScreen: React.FC = () => {
  const { data: invoices, isLoading, isError, refetch } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => fetchInvoices(),
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 className="page-title">Invoices & Billing</h1>
          <p className="page-sub">Manage client billing, payments, and treatment packages</p>
        </div>
        <Link to="/invoices/new" className="btn btn-primary">
          + Create Invoice
        </Link>
      </div>

      {isError && (
        <div className="alert alert-danger">
          Could not load invoices.{' '}
          <button onClick={() => refetch()} className="btn btn-ghost btn-sm">
            Retry
          </button>
        </div>
      )}

      {isLoading ? (
        <p style={{ color: 'var(--brown-500)' }}>Loading invoices...</p>
      ) : !invoices || invoices.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ color: 'var(--brown-500)', margin: 0 }}>No invoices created yet.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Patient</th>
                <th>Date</th>
                <th>Total</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td style={{ fontWeight: 700 }}>
                    <Link to={`/invoices/${inv.id}`} style={{ color: 'var(--brown-900)' }}>
                      {inv.invoice_no}
                    </Link>
                  </td>
                  <td>{inv.pet_name || '—'}</td>
                  <td>{inv.created_at?.substring(0, 10) || '—'}</td>
                  <td>₹{inv.total ?? '—'}</td>
                  <td>
                    <span className={`badge badge-${(inv.payment_status || 'unknown').toLowerCase()}`}>
                      {inv.payment_status || 'Unknown'}
                    </span>
                  </td>
                  <td>
                    <Link to={`/invoices/${inv.id}`} className="btn btn-secondary btn-sm">
                      View Details &rarr;
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
