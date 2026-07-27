import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const UserMenu: React.FC = () => {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const initial = (user.email || 'U').charAt(0).toUpperCase();

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          backgroundColor: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '20px',
          padding: '0.35rem 0.75rem 0.35rem 0.4rem',
          color: '#f8fafc',
          cursor: 'pointer',
          fontSize: '0.85rem',
          fontWeight: 600
        }}
      >
        <div style={{
          width: '26px',
          height: '26px',
          borderRadius: '50%',
          backgroundColor: '#38bdf8',
          color: '#0f172a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: '0.8rem'
        }}>
          {initial}
        </div>
        <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.email}
        </span>
        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          backgroundColor: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '0.75rem',
          minWidth: '220px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
          zIndex: 1000
        }}>
          <div style={{ paddingBottom: '0.5rem', marginBottom: '0.5rem', borderBottom: '1px solid #1e293b' }}>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Signed in as</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f8fafc', wordBreak: 'break-all' }}>{user.email}</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: '#34d399', marginTop: '0.3rem' }}>
              <span>🔒</span> Supabase RLS Protected
            </div>
          </div>

          <button
            onClick={() => { setOpen(false); signOut(); }}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              border: 'none',
              color: '#fca5a5',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <span>🚪</span> Sign Out
          </button>
        </div>
      )}
    </div>
  );
};
