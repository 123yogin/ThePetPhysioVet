import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { confirmPasswordReset } from '../api/auth';
import { useFlash } from '../lib/flash';
import { Icon } from '../components/Icon';
import { PasswordField } from '../components/PasswordField';

const MIN_PASSWORD_LENGTH = 6;

export const ResetPasswordScreen: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { addFlash } = useFlash();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="auth-shell">
        <div className="auth-card" style={{ maxWidth: '460px' }}>
          <h1 className="auth-brand" style={{ fontSize: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
            <Icon name="paw" size={24} /> The Pet Physio Vet
          </h1>
          <div className="alert alert-danger" role="alert">
            <span>This password reset link is missing its token. Please request a new link.</span>
          </div>
          <Link
            to="/forgot-password"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '16px', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '44px' }}
          >
            Request a New Link
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await confirmPasswordReset(token, newPassword);
      addFlash('Your password has been reset. Please sign in.', 'success');
      navigate('/login');
    } catch (err: any) {
      setError(err.message || 'This password reset link is invalid or has expired.');
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

        <form onSubmit={handleSubmit}>
          <p style={{ fontSize: '14px', color: 'var(--brown-500)', marginBottom: '20px' }}>
            Choose a new password for your account.
          </p>

          {error && (
            <div className="alert alert-danger" role="alert" style={{ marginBottom: '16px' }}>
              <span>{error}</span>
            </div>
          )}

          <PasswordField
            id="newPassword"
            label="New Password"
            value={newPassword}
            onChange={setNewPassword}
            placeholder="At least 6 characters"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />

          <PasswordField
            id="confirmPassword"
            label="Confirm New Password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="Re-enter your new password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '12px', padding: '12px', minHeight: '44px' }}
            disabled={loading}
          >
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>

          <div className="auth-footer">
            <Link to="/login">Back to Sign In</Link>
          </div>
        </form>
      </div>
    </div>
  );
};
