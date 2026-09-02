import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchOwnerInvoices, fetchOwnerInvoiceDetail } from '../api/owner';
import { humanizeStatus, friendlyDate } from '../lib/labels';
import { Icon } from '../components/Icon';

export const OwnerBillingScreen: React.FC = () => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: invoices, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['ownerInvoices'],
    queryFn: fetchOwnerInvoices,
  });

  const {
    data: detail,
    isLoading: detailLoading,
    isError: detailIsError,
    error: detailError,
  } = useQuery({
    queryKey: ['ownerInvoiceDetail', expandedId],
    queryFn: () => fetchOwnerInvoiceDetail(expandedId as string),
    enabled: expandedId !== null,
  });

  const toggle = (id: string) => {
    setExpandedId((current) => (current === id ? null : id));
  };

  return (
    <div>
      <h1 className="page-title">My Invoices</h1>
      <p className="page-sub">
        Statements from your vet. Online payment isn't set up yet — please pay at the clinic.
      </p>

      {isError && (
        <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Could not load your invoices{error instanceof Error && error.message ? `: ${error.message}` : '.'}</span>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {invoices.map((inv) => {
            const isOpen = expandedId === inv.id;
            return (
              <div key={inv.id} className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <button
                  onClick={() => toggle(inv.id)}
                  aria-expanded={isOpen}
                  aria-controls={`invoice-detail-${inv.id}`}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    font: 'inherit',
                    color: 'inherit',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '20px',
                    minHeight: '44px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--brown-900)' }}>
                        {inv.invoice_no}
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--brown-600)', marginTop: '4px' }}>
                        {inv.pet_name || 'Your pet'} &bull; {friendlyDate(inv.created_at)}
                      </div>
                    </div>
                    <span className={`badge badge-${(inv.payment_status || 'unknown').toLowerCase()}`}>
                      {humanizeStatus(inv.payment_status)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px' }}>
                    <div>
                      <div style={{ fontSize: '12px', color: 'var(--brown-600)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Balance Due
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--brown-900)' }}>
                        ₹{inv.balance_due ?? inv.total ?? '—'}
                      </div>
                    </div>
                    <span style={{ color: 'var(--brown-600)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
                      {isOpen ? 'Hide details' : 'View details'}
                      <Icon name={isOpen ? 'close' : 'arrowRight'} size={14} />
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <div id={`invoice-detail-${inv.id}`} style={{ borderTop: '1px solid var(--glass-border)', padding: '20px' }}>
                    {detailLoading ? (
                      <p style={{ color: 'var(--brown-500)', margin: 0 }}>Loading invoice details...</p>
                    ) : detailIsError ? (
                      <p style={{ color: '#b71c1c', margin: 0 }}>
                        Couldn't load this invoice{detailError instanceof Error && detailError.message ? `: ${detailError.message}` : '.'}
                      </p>
                    ) : detail ? (
                      <>
                        {detail.line_items && detail.line_items.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                            {detail.line_items.map((item, idx) => (
                              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--brown-800)' }}>
                                <span>{item.description} &times; {item.quantity}</span>
                                <span style={{ fontWeight: 700 }}>₹{item.amount}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p style={{ color: 'var(--brown-600)', fontSize: '13px' }}>No line items on this invoice.</p>
                        )}

                        <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--brown-700)' }}>
                            <span>Subtotal</span>
                            <span>₹{detail.subtotal}</span>
                          </div>
                          {!!detail.tax && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--brown-700)' }}>
                              <span>Tax</span>
                              <span>₹{detail.tax}</span>
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--brown-900)', fontWeight: 700 }}>
                            <span>Total</span>
                            <span>₹{detail.total}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--brown-700)' }}>
                            <span>Paid so far</span>
                            <span>₹{detail.amount_paid}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--brown-900)', fontWeight: 800, fontSize: '15px', marginTop: '4px' }}>
                            <span>Balance Due</span>
                            <span>₹{detail.balance_due}</span>
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
