import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const AuthLandingView: React.FC = () => {
  const { sendMagicLink, verifyOtp } = useAuth();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || loading) return;

    setLoading(true);
    setErrorMsg('');
    setInfoMsg('');

    const { error } = await sendMagicLink(email.trim());
    setLoading(false);

    if (error) {
      setErrorMsg(error.message || 'Failed to send login code. Please try again.');
    } else {
      setStep('otp');
      setInfoMsg(`We sent a 6-digit code and Magic Link to ${email}. Check your inbox!`);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim() || loading) return;

    setLoading(true);
    setErrorMsg('');

    const { error } = await verifyOtp(email.trim(), otp.trim());
    setLoading(false);

    if (error) {
      setErrorMsg(error.message || 'Invalid passcode. Please try again.');
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      width: '100vw',
      backgroundColor: '#090d16',
      backgroundImage: 'radial-gradient(circle at 50% 20%, #1e293b 0%, #090d16 80%)',
      color: '#f8fafc',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '1.5rem',
      boxSizing: 'border-box'
    }}>
      <div style={{
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '24px',
        padding: '3rem 2.5rem',
        maxWidth: '440px',
        width: '100%',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 40px rgba(56, 189, 248, 0.1)',
        textAlign: 'center'
      }}>
        {/* Brand Header */}
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.5rem auto',
          boxShadow: '0 10px 20px rgba(56, 189, 248, 0.3)'
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
        </div>

        <h1 style={{ fontSize: '1.85rem', fontWeight: 800, margin: '0 0 0.5rem 0', letterSpacing: '-0.02em', color: '#ffffff' }}>
          Inquisitive AI
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '0.95rem', margin: '0 0 2rem 0', lineHeight: '1.5' }}>
          Excalidraw AI Copilot with secure Supabase authentication
        </p>

        {errorMsg && (
          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#fca5a5',
            borderRadius: '10px',
            padding: '0.75rem 1rem',
            fontSize: '0.875rem',
            marginBottom: '1.25rem',
            textAlign: 'left'
          }}>
            {errorMsg}
          </div>
        )}

        {infoMsg && (
          <div style={{
            backgroundColor: 'rgba(56, 189, 248, 0.15)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            color: '#7dd3fc',
            borderRadius: '10px',
            padding: '0.75rem 1rem',
            fontSize: '0.875rem',
            marginBottom: '1.25rem',
            textAlign: 'left'
          }}>
            {infoMsg}
          </div>
        )}

        {step === 'email' ? (
          <form onSubmit={handleSendLink} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ textAlign: 'left' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>
                Email address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                style={{
                  width: '100%',
                  padding: '0.85rem 1rem',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid #334155',
                  color: '#ffffff',
                  fontSize: '0.95rem',
                  boxSizing: 'border-box',
                  outline: 'none'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.9rem',
                borderRadius: '12px',
                border: 'none',
                background: 'linear-gradient(135deg, #38bdf8 0%, #6366f1 100%)',
                color: '#ffffff',
                fontSize: '1rem',
                fontWeight: 700,
                cursor: loading ? 'wait' : 'pointer',
                boxShadow: '0 4px 14px rgba(56, 189, 248, 0.4)',
                marginTop: '0.5rem',
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? 'Sending Code...' : 'Continue with Email Code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ textAlign: 'left' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>
                Enter 6-digit Passcode
              </label>
              <input
                type="text"
                required
                maxLength={8}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="123456"
                style={{
                  width: '100%',
                  padding: '0.85rem 1rem',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid #38bdf8',
                  color: '#ffffff',
                  fontSize: '1.25rem',
                  letterSpacing: '0.2em',
                  textAlign: 'center',
                  fontWeight: 700,
                  boxSizing: 'border-box',
                  outline: 'none'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.9rem',
                borderRadius: '12px',
                border: 'none',
                background: 'linear-gradient(135deg, #38bdf8 0%, #6366f1 100%)',
                color: '#ffffff',
                fontSize: '1rem',
                fontWeight: 700,
                cursor: loading ? 'wait' : 'pointer',
                boxShadow: '0 4px 14px rgba(56, 189, 248, 0.4)',
                marginTop: '0.5rem',
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? 'Verifying...' : 'Sign In & Enter Workspace'}
            </button>

            <button
              type="button"
              onClick={() => { setStep('email'); setErrorMsg(''); setInfoMsg(''); }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                fontSize: '0.85rem',
                cursor: 'pointer',
                marginTop: '0.5rem',
                textDecoration: 'underline'
              }}
            >
              ← Change Email address
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
