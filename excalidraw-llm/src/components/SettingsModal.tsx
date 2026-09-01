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
  if (!open) return null

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-window" onClick={(e) => e.stopPropagation()}>
        <div className="popup-header">
          <h3>⚙️ AI Provider Settings</h3>
          <button className="popup-close-btn" onClick={onClose}>✕</button>
        </div>
        
        <div className="popup-body">
          {/* Provider Selection Cards */}
          <div className="provider-selector">
            <div
              className={`provider-card ${provider === 'ollama' ? 'active' : ''}`}
              onClick={() => setProvider('ollama')}
            >
              <div className="provider-icon">🦙</div>
              <div className="provider-title">Ollama Local</div>
              <div className="provider-subtitle">Free & Private</div>
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
              <input
                type="password"
                value={ollamaApiKey}
                onChange={(e) => setOllamaApiKey(e.target.value)}
                placeholder="Bearer token or API key..."
              />
              <div className="setting-hint">
                Key is saved in ephemeral <code>sessionStorage</code> and cleared automatically on tab close.
              </div>

              <label style={{ marginTop: '12px' }}>Ollama Model Preset</label>
              <select
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                className="model-select"
                style={{ marginBottom: '8px' }}
              >
                <option value="gemma4:31b-cloud">gemma4:31b-cloud (Gemma 4 31B Cloud)</option>
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
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
              />
              <div className="setting-hint">
                Key is saved in ephemeral <code>sessionStorage</code> and cleared automatically on tab close.
              </div>

              <label style={{ marginTop: '12px' }}>Gemini Model</label>
              <select
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                className="model-select"
              >
                <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Fastest)</option>
                <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite (Ultra-Fast 3.5)</option>
                <option value="gemma-4-31b-it">gemma-4-31b-it (Gemma 4 31B Instruct)</option>
                <option value="gemma-4-26b-it">gemma-4-26b-it (Gemma 4 26B Instruct)</option>
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
