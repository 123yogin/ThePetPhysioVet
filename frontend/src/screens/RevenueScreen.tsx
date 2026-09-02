import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchRevenueStats } from '../api/billing';
import { Icon } from '../components/Icon';

export const RevenueScreen: React.FC = () => {
  const [range, setRange] = useState('month');

  const { data: revData, isLoading, isError, refetch } = useQuery({
    queryKey: ['revenueStats', range],
    queryFn: () => fetchRevenueStats(range),
  });

  const formatMoney = (value: unknown) =>
    Number(value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 className="page-title">Revenue Analytics</h1>
          <p className="page-sub">Financial performance, collected payments, and revenue summaries</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setRange('today')}
            className={`btn btn-sm ${range === 'today' ? 'btn-primary' : 'btn-ghost'}`}
          >
            Today
          </button>
          <button
            onClick={() => setRange('month')}
            className={`btn btn-sm ${range === 'month' ? 'btn-primary' : 'btn-ghost'}`}
          >
            This Month
          </button>
          <button
            onClick={() => setRange('year')}
            className={`btn btn-sm ${range === 'year' ? 'btn-primary' : 'btn-ghost'}`}
          >
            This Year
          </button>
        </div>
      </div>

      {isError && (
        <div className="alert alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Could not load revenue data. No figures are shown below to avoid displaying inaccurate numbers.</span>
          <button onClick={() => refetch()} className="btn btn-ghost btn-sm">
            <Icon name="refresh" /> Retry
          </button>
        </div>
      )}

      {!isError && (
        <div className="grid-cards" style={{ marginBottom: '24px' }}>
          <div className="glass-card">
            <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--brown-500)', textTransform: 'uppercase' }}>
              Total Revenue ({range})
            </div>
            <div style={{ fontSize: '32px', fontWeight: '800', color: 'var(--brown-900)', marginTop: '8px' }}>
              {isLoading ? '...' : `₹${formatMoney(revData?.total_revenue)}`}
            </div>
          </div>

          <div className="glass-card">
            <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--brown-500)', textTransform: 'uppercase' }}>
              Collected Payments
            </div>
            <div style={{ fontSize: '32px', fontWeight: '800', color: '#1b5e20', marginTop: '8px' }}>
              {isLoading ? '...' : `₹${formatMoney(revData?.collected)}`}
            </div>
          </div>

          <div className="glass-card">
            <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--brown-500)', textTransform: 'uppercase' }}>
              Pending Balances
            </div>
            <div style={{ fontSize: '32px', fontWeight: '800', color: '#b71c1c', marginTop: '8px' }}>
              {isLoading ? '...' : `₹${formatMoney(revData?.pending)}`}
            </div>
          </div>
        </div>
      )}

      {!isLoading && !isError && !revData && (
        <div className="glass-card" style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ color: 'var(--brown-500)', margin: 0 }}>No revenue data available for this period.</p>
        </div>
      )}
    </div>
  );
};
