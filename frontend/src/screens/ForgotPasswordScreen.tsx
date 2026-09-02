import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '../api/auth';
import { Icon } from '../components/Icon';

export const ForgotPasswordScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      // Always show the same confirmation, whether or not the account
      // exists -- the backend response is deliberately ambiguous and the
      // UI must not add anything that narrows it (e.g. "we found your
      // account"), or it reintroduces the user-enumeration leak.
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card" style={{ maxWidth: '460px' }}>
        <h1 className="auth-brand" style={{ fontSize: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <Icon name="paw" size={24} /> The Pet Physio Vet
        </h1>

        {submitted ? (
          <div>
            <div className="alert alert-info" role="status">
              <Icon name="mail" size={18} />
              <span>If an account exists for that email, a password reset link has been sent.</span>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--brown-500)', marginTop: '8px' }}>
              Check your email for a link to reset your password. It may take a few minutes to arrive.
            </p>
            <Link
              to="/login"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '16px', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '44px' }}
            >
              Back to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <p style={{ fontSize: '14px', color: 'var(--brown-500)', marginBottom: '20px' }}>
              Enter the email address on your account and we'll send you a link to reset your password.
            </p>

            {error && (
              <div className="alert alert-danger" role="alert" style={{ marginBottom: '16px' }}>
                <span>{error}</span>
              </div>
            )}

            <div className="field">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                className="input-glass"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '12px', padding: '12px', minHeight: '44px' }}
              disabled={loading}
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <div className="auth-footer">
              <Link to="/login">Back to Sign In</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
