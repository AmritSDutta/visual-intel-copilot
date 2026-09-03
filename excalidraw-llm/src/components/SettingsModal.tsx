import { useState } from 'react'
import { CANVAS_GEMINI_MODEL_OPTIONS, OLLAMA_MODEL_PRESETS } from '../config/aiModelsConfig'

export interface SettingsModalProps {
  open: boolean
  onClose: () => void
  provider: 'ollama' | 'gemini'
  setProvider: (provider: 'ollama' | 'gemini') => void
  ollamaEndpoint: string
  setOllamaEndpoint: (endpoint: string) => void
  ollamaModel: string
  setOllamaModel: (model: string) => void
  ollamaApiKey: string
  setOllamaApiKey: (key: string) => void
  apiKey: string
  setApiKey: (key: string) => void
  modelName: string
  setModelName: (model: string) => void
}

export function SettingsModal({
  open,
  onClose,
  provider,
  setProvider,
  ollamaEndpoint,
  setOllamaEndpoint,
  ollamaModel,
  setOllamaModel,
  ollamaApiKey,
  setOllamaApiKey,
  apiKey,
  setApiKey,
  modelName,
  setModelName
}: SettingsModalProps) {
  const [showGeminiKey, setShowGeminiKey] = useState(false)
  const [showOllamaKey, setShowOllamaKey] = useState(false)

  if (!open) return null

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-card settings-popup-card" onClick={(e) => e.stopPropagation()}>
        <div className="popup-header">
          <h3>⚙️ Visual Intelligence Settings</h3>
          <button className="popup-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        
        <div className="popup-body">
          {/* Provider Selection Cards */}
          <div className="provider-selector">
            <div
              className={`provider-card ${provider === 'ollama' ? 'active' : ''}`}
              onClick={() => setProvider('ollama')}
            >
              <div className="provider-icon">🦙</div>
              <div className="provider-title">Ollama</div>
              <div className="provider-subtitle">Local & Cloud Proxies</div>
            </div>
            <div
              className={`provider-card ${provider === 'gemini' ? 'active' : ''}`}
              onClick={() => setProvider('gemini')}
            >
              <div className="provider-icon">✨</div>
              <div className="provider-title">Gemini Cloud</div>
              <div className="provider-subtitle">High Capability</div>
            </div>
          </div>

          {provider === 'ollama' ? (
            <div className="setting-group">
              <label>Ollama Server Endpoint Preset</label>
              <select
                className="model-select"
                style={{ marginBottom: '10px' }}
                value={
                  ollamaEndpoint === 'https://ollama.com' || ollamaEndpoint === 'https://ollama.com/'
                    ? 'https://ollama.com'
                    : 'custom'
                }
                onChange={(e) => {
                  const val = e.target.value
                  if (val !== 'custom') {
                    setOllamaEndpoint(val)
                  }
                }}
              >
                <option value="https://ollama.com">☁️ Ollama Cloud API (https://ollama.com)</option>
                <option value="custom">⚙️ Custom Server / Cloud Proxy URL...</option>
              </select>

              <label>Ollama Host URL</label>
              <input
                type="text"
                value={ollamaEndpoint}
                onChange={(e) => setOllamaEndpoint(e.target.value)}
                placeholder="https://ollama.com"
              />

              <label style={{ marginTop: '12px' }}>Ollama API Key (Optional for Cloud/Proxies)</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type={showOllamaKey ? 'text' : 'password'}
                  value={ollamaApiKey}
                  onChange={(e) => setOllamaApiKey(e.target.value)}
                  placeholder="Bearer token or API key..."
                  style={{ width: '100%', paddingRight: '36px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowOllamaKey(!showOllamaKey)}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '14px',
                    opacity: 0.7
                  }}
                  title={showOllamaKey ? 'Hide key' : 'Show key'}
                >
                  {showOllamaKey ? '🙈' : '👁️'}
                </button>
              </div>
              <div className="setting-hint">
                Key is saved securely (AES-GCM-256) in encrypted client storage.
              </div>

              <label style={{ marginTop: '12px' }}>Ollama Model Preset</label>
              <select
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                className="model-select"
                style={{ marginBottom: '8px' }}
              >
                {OLLAMA_MODEL_PRESETS.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
              <input
                type="text"
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                placeholder="Or enter custom model name..."
              />
              <div className="setting-hint">
                Cloud calls to <code>https://ollama.com</code> are securely routed via the <code>/api/proxy</code> backend.
              </div>
            </div>
          ) : (
            <div className="setting-group">
              <label>Gemini API Key</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type={showGeminiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  style={{ width: '100%', paddingRight: '36px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '14px',
                    opacity: 0.7
                  }}
                  title={showGeminiKey ? 'Hide key' : 'Show key'}
                >
                  {showGeminiKey ? '🙈' : '👁️'}
                </button>
              </div>
              <div className="setting-hint">
                Key is saved securely (AES-GCM-256) in encrypted client storage.
              </div>

              <label style={{ marginTop: '12px' }}>Gemini Model</label>
              <select
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                className="model-select"
              >
                {CANVAS_GEMINI_MODEL_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="popup-footer">
          <button className="popup-done-btn" onClick={onClose}>Save & Close</button>
        </div>
      </div>
    </div>
  )
}
