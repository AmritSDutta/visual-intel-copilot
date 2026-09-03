import { UserMenu } from './UserMenu';
import { TASK_MODEL_REGISTRY } from '../config/aiModelsConfig';

export interface AppHeaderProps {
  currentPath: string;
  onNavigate?: (path: string) => void;
  provider: 'ollama' | 'gemini';
  setProvider: (provider: 'ollama' | 'gemini') => void;
  isLoading?: boolean;
  isListening?: boolean;
  isSpeaking?: boolean;
  isMuted?: boolean;
  onToggleMute?: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  onExportPng: () => void;
  onNewSession?: () => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  isCanvasFrozen?: boolean;
  onToggleCanvasLock?: () => void;
  ollamaModel?: string;
  modelName?: string;
}

export function AppHeader({
  currentPath,
  onNavigate,
  provider,
  setProvider,
  isLoading = false,
  isListening = false,
  isSpeaking = false,
  isMuted = false,
  onToggleMute,
  onOpenHistory,
  onOpenSettings,
  onExportPng,
  onNewSession,
  theme = 'dark',
  onToggleTheme,
  isCanvasFrozen,
  onToggleCanvasLock,
  ollamaModel = TASK_MODEL_REGISTRY.OLLAMA_CHAT.primaryModel,
  modelName = TASK_MODEL_REGISTRY.CANVAS_MAIN_AGENT.primaryModel
}: AppHeaderProps) {
  const isAudioActive = isListening || isSpeaking;

  return (
    <header className="app-header">
      <div className="header-brand">
        <h1>💡 Inquisitive</h1>
        <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 'normal', borderLeft: '1px solid #374151', paddingLeft: '10px' }}>
          Visual Intelligence
        </span>

        {/* Path Navigation Pills */}
        <div className="route-nav-pills">
          <button
            className={`route-pill ${currentPath === '/' ? 'active' : ''}`}
            onClick={() => onNavigate?.('/')}
            title="Canvas Chat Mode"
          >
            🎨 Canvas
          </button>
          <button
            className={`route-pill ${currentPath === '/voice' ? 'active' : ''}`}
            onClick={() => onNavigate?.('/voice')}
            title="Voice Assistant Mode"
          >
            🎙️ Voice Mode
          </button>
        </div>

        {/* Unified Audio Signal Indicator in Header */}
        <div
          className={`header-audio-signal ${isAudioActive ? 'active' : ''} ${isListening ? 'listening' : isSpeaking ? 'speaking' : ''}`}
          title={isListening ? 'Listening to Microphone' : isSpeaking ? 'Gemini Native Audio Speaking' : 'Native Audio Signal Ready'}
        >
          <div className="header-signal-bars">
            <span className="h-bar b1"></span>
            <span className="h-bar b2"></span>
            <span className="h-bar b3"></span>
            <span className="h-bar b4"></span>
          </div>
          <span className="header-signal-label">
            {isListening
              ? '🎙️ Mic Active'
              : isSpeaking
              ? '🔊 Gemini Audio'
              : '🎵 Native Audio'}
          </span>
        </div>

        {/* Status Badge */}
        <div className="status-badge">
          <span className={`status-dot ${isListening ? 'listening' : isSpeaking ? 'speaking' : isLoading ? 'loading' : ''}`}></span>
          {isListening
            ? '🎙️ Listening...'
            : isSpeaking
            ? '🔊 Native Audio Speaking...'
            : isLoading
            ? '⚡ Generating Diagram...'
            : provider === 'ollama'
            ? `🦙 Ollama (${ollamaModel})`
            : `✨ Gemini (${modelName || 'gemini-2.5-flash-native-audio-latest'})`}
        </div>
      </div>

      <div className="header-actions">
        {/* Mute/Unmute Toggle Button */}
        {onToggleMute && (
          <button
            className={`voice-mute-btn ${isMuted ? 'muted' : ''}`}
            onClick={onToggleMute}
            title={isMuted ? 'Unmute Native Audio Response' : 'Mute Native Audio Response'}
          >
            {isMuted ? '🔇 Muted' : '🔊 Audio On'}
          </button>
        )}

        {/* Quick Provider Selector Pills & Settings Icon */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border-color)' }}>
          <button
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              background: provider === 'ollama' ? 'var(--accent-gradient)' : 'transparent',
              border: 'none',
              color: provider === 'ollama' ? '#fff' : 'var(--text-secondary)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 600
            }}
            onClick={() => setProvider('ollama')}
          >
            🦙 Ollama
          </button>
          <button
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              background: provider === 'gemini' ? 'var(--accent-gradient)' : 'transparent',
              border: 'none',
              color: provider === 'gemini' ? '#fff' : 'var(--text-secondary)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 600
            }}
            onClick={() => setProvider('gemini')}
          >
            ✨ Gemini
          </button>
          <button
            style={{
              padding: '3px 7px',
              fontSize: '13px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onClick={onOpenSettings}
            title="Configure Provider & API Keys"
          >
            ⚙️
          </button>
        </div>

        {onNewSession && (
          <button className="icon-btn" onClick={onNewSession} title="New Session">
            ➕
          </button>
        )}
        <button className="icon-btn" onClick={onOpenHistory} title="Session History">
          📜
        </button>
        <button className="icon-btn" onClick={onExportPng} title="Export Diagram PNG">
          📷
        </button>

        {onToggleCanvasLock && isCanvasFrozen !== undefined && (
          <button
            className="icon-btn"
            onClick={onToggleCanvasLock}
            title={isCanvasFrozen ? 'Unlock Canvas Editing' : 'Freeze Canvas'}
          >
            {isCanvasFrozen ? '🔒' : '🔓'}
          </button>
        )}

        {onToggleTheme && (
          <button className="icon-btn" onClick={onToggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        )}

        <UserMenu />
      </div>
    </header>
  );
}
