import React from 'react';

export const ConfigMissingScreen: React.FC = () => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      width: '100vw',
      backgroundColor: '#0f172a',
      color: '#f8fafc',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '2rem',
      boxSizing: 'border-box'
    }}>
      <div style={{
        backgroundColor: 'rgba(30, 41, 59, 0.8)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '16px',
        padding: '2.5rem',
        maxWidth: '560px',
        width: '100%',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#f8fafc' }}>
          Supabase Environment Configuration Missing
        </h2>
        <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>
          This application enforces strict Supabase Authentication. Please configure your environment variables in <code style={{ background: '#334155', color: '#38bdf8', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>.env.local</code> to proceed.
        </p>

        <div style={{
          backgroundColor: '#090d16',
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '1rem',
          textAlign: 'left',
          fontSize: '0.85rem',
          color: '#e2e8f0',
          fontFamily: 'monospace',
          marginBottom: '1.5rem',
          overflowX: 'auto'
        }}>
          <div># Create .env.local in excalidraw-llm directory:</div>
          <div style={{ color: '#a7f3d0', marginTop: '0.5rem' }}>VITE_SUPABASE_URL=https://your-project.supabase.co</div>
          <div style={{ color: '#a7f3d0' }}>VITE_SUPABASE_ANON_KEY=your-supabase-anon-key</div>
        </div>

        <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>
          After creating your <code style={{ background: '#334155', color: '#94a3b8', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>.env.local</code> file, restart the Vite dev server.
        </p>
      </div>
    </div>
  );
};
