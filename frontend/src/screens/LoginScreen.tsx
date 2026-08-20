import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, signup } from '../api/auth';
import { useFlash } from '../lib/flash';
import { Icon } from '../components/Icon';

export const LoginScreen: React.FC = () => {
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Registration form fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { addFlash } = useFlash();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoading(true);
    try {
      const user = await login(username, password);
      addFlash(`Welcome back, ${user.first_name || user.username}!`, 'success');
      if (user.role === 'OWNER') {
        navigate('/owner/home');
      } else {
        navigate('/dashboard');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Login failed. Please check your username and password.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError(null);
    if (!firstName || !email) {
      setRegisterError('Please enter your first name and email address.');
      return;
    }
    if (!regPassword) {
      setRegisterError('Please choose a password.');
      return;
    }
    setLoading(true);
    try {
      const user = await signup({
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        username: regUsername || email.split('@')[0],
        password: regPassword,
        role: 'OWNER',
      });
      addFlash(`Welcome to Pet Physio, ${user.first_name}! Your Owner Profile is active.`, 'success');
      navigate('/owner/home');
    } catch (err: any) {
      setRegisterError(err.message || 'Registration failed.');
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

        {/* Mode Selector Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', background: 'rgba(255,255,255,0.6)', padding: '4px', borderRadius: '12px' }}>
          <button
            type="button"
            className={`btn ${!isRegisterMode ? 'btn-primary' : 'btn-ghost'}`}
            style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}
            onClick={() => setIsRegisterMode(false)}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`btn ${isRegisterMode ? 'btn-primary' : 'btn-ghost'}`}
            style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}
            onClick={() => setIsRegisterMode(true)}
          >
            New Owner Registration
          </button>
        </div>

        {!isRegisterMode ? (
          <form onSubmit={handleLogin}>
            {loginError && (
              <div className="alert alert-danger" role="alert" style={{ marginBottom: '16px' }}>
                <span>{loginError}</span>
              </div>
            )}

            <div className="field">
              <label htmlFor="username">Username or Email</label>
              <input
                id="username"
                type="text"
                className="input-glass"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                autoComplete="username"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="input-glass"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '12px', padding: '12px' }}
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegisterOwner}>
            {registerError && (
              <div className="alert alert-danger" role="alert" style={{ marginBottom: '16px' }}>
                <span>{registerError}</span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="field">
                <label htmlFor="firstName">First Name *</label>
                <input
                  id="firstName"
                  type="text"
                  className="input-glass"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="e.g. Ananya"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="lastName">Last Name</label>
                <input
                  id="lastName"
                  type="text"
                  className="input-glass"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="e.g. Rao"
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="email">Email Address *</label>
              <input
                id="email"
                type="email"
                className="input-glass"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ananya@example.com"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="phone">Phone Number</label>
              <input
                id="phone"
                type="tel"
                className="input-glass"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 12345"
              />
            </div>

            <div className="field">
              <label htmlFor="regUsername">Username</label>
              <input
                id="regUsername"
                type="text"
                className="input-glass"
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value)}
                placeholder="Leave blank to use your email"
                autoComplete="username"
              />
            </div>

            <div className="field">
              <label htmlFor="regPassword">Password *</label>
              <input
                id="regPassword"
                type="password"
                className="input-glass"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder="Create password"
                autoComplete="new-password"
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '12px', padding: '12px' }}
              disabled={loading}
            >
              {loading ? 'Creating Profile...' : 'Register Owner Profile'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
