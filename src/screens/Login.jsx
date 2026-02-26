import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) return;
    setLoading(true);

    const uname = username.trim();
    const authEmail = `${uname}@frysmart.app`;
    const { error: authError } = await supabase.auth.signInWithPassword({ email: authEmail, password });
    setLoading(false);
    if (authError) {
      setError('Invalid username or password.');
    }
  };

  const inputStyle = (field) => ({
    width: '100%',
    padding: '14px 16px',
    fontSize: '16px',
    border: `2px solid ${focusedField === field ? '#1a428a' : '#e2e8f0'}`,
    borderRadius: '12px',
    outline: 'none',
    transition: 'all 0.2s ease',
    boxSizing: 'border-box',
    background: focusedField === field ? '#f8faff' : '#f8fafc',
    color: '#0f172a',
    fontFamily: 'inherit',
  });

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#1a428a',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
      padding: '20px',
      boxSizing: 'border-box',
      overflow: 'auto',
    }}>
      {/* Logo / branding — outside the white box */}
      <div style={{ textAlign: 'center', marginBottom: '0px', width: '100%', maxWidth: '420px' }}>
        <img
          src="/images/Login Page.png"
          alt="FrySmart"
          style={{ width: '100%', maxWidth: '440px', margin: '0 auto', display: 'block' }}
        />
      </div>

      {/* White login card */}
      <div style={{
        width: '100%',
        maxWidth: '420px',
        padding: '32px 28px 28px',
        background: 'white',
        borderRadius: '24px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        boxSizing: 'border-box',
      }}>
        <h2 style={{
          textAlign: 'center',
          fontSize: '20px',
          fontWeight: '700',
          color: '#1a428a',
          margin: '0 0 24px',
        }}>Welcome Back!</h2>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '18px' }}>
            <label style={{
              display: 'block', fontSize: '13px', fontWeight: '600',
              color: '#475569', marginBottom: '8px',
            }}>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              placeholder="Enter your username"
              style={inputStyle('username')}
              onFocus={() => setFocusedField('username')}
              onBlur={() => setFocusedField(null)}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block', fontSize: '13px', fontWeight: '600',
              color: '#475569', marginBottom: '8px',
            }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="Enter your password"
              style={inputStyle('password')}
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField(null)}
            />
          </div>

          {error && (
            <div style={{
              padding: '12px 16px', marginBottom: '18px', borderRadius: '12px',
              background: '#fef2f2', border: '1px solid #fecaca',
              fontSize: '13px', color: '#991b1b', fontWeight: '500',
            }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              fontSize: '16px',
              fontWeight: '600',
              color: 'white',
              background: loading ? '#94a3b8' : '#f5a623',
              border: 'none',
              borderRadius: '12px',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              letterSpacing: '0.3px',
              fontFamily: 'inherit',
            }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p style={{
          textAlign: 'center', fontSize: '12px', color: '#94a3b8',
          marginTop: '20px', marginBottom: 0,
        }}>
          Forgot your password?<br />Contact your Cookers representative.
        </p>
      </div>
    </div>
  );
}
