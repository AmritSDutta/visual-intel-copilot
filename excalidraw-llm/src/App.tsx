import { useState, useEffect, useRef } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import './App.css'
import { generateDiagramFromPrompt, generateDiagramWithOllama } from './services/aiService'
import { saveSessionTurn, getSessionTurns, getAllSessionsSummary, deleteSessionTurns } from './services/sessionDbService'
import type { SessionSummary, SessionTurnRecord } from './services/sessionDbService'
import { exportSessionToPdf } from './services/pdfExportService'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ConfigMissingScreen } from './components/ConfigMissingScreen'
import { AuthLandingView } from './components/AuthLandingView'
import { saveCloudSessionTurn, getCloudSessionsSummary, getCloudSessionTurns, deleteCloudSession } from './services/supabaseDbService'
import { VoiceWorkspace } from './components/VoiceWorkspace'
import { AppHeader } from './components/AppHeader'

interface Message {
  id: string
  sender: 'user' | 'assistant'
  text: string
  timestamp: string
  suggestions?: string[]
}

interface MainWorkspaceProps {
  onNavigate?: (path: string) => void
}

function MainWorkspace({ onNavigate }: MainWorkspaceProps) {
  const { user } = useAuth()
  const [input, setInput] = useState('')
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null)
  
  // Active Session state
  const [sessionId, setSessionId] = useState<string>(() => `sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`)
  const [showHistory, setShowHistory] = useState(false)
  const [historySummaries, setHistorySummaries] = useState<SessionSummary[]>([])

  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light'>(() => 
    (localStorage.getItem('APP_THEME') as 'dark' | 'light') || 'dark'
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('APP_THEME', theme)
  }, [theme])

  // Provider & settings state (stored in ephemeral sessionStorage)
  const [provider, setProvider] = useState<'ollama' | 'gemini'>(() => 
    (sessionStorage.getItem('AI_PROVIDER') as 'ollama' | 'gemini') || 'ollama'
  )
  const [ollamaEndpoint, setOllamaEndpoint] = useState(() => 
    sessionStorage.getItem('OLLAMA_ENDPOINT') || 'https://ollama.com'
  )
  const [ollamaModel, setOllamaModel] = useState(() => 
    sessionStorage.getItem('OLLAMA_MODEL') || 'gemma4:31b-cloud'
  )
  const [ollamaApiKey, setOllamaApiKey] = useState(() => 
    sessionStorage.getItem('OLLAMA_API_KEY') || ''
  )
  const [apiKey, setApiKey] = useState(() => 
    sessionStorage.getItem('GEMINI_API_KEY') || ''
  )
  const [modelName, setModelName] = useState(() => 
    sessionStorage.getItem('GEMINI_MODEL') || 'gemini-3.1-flash-lite'
  )
  const [showSettings, setShowSettings] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isCanvasFrozen, setIsCanvasFrozen] = useState(true)

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      sender: 'assistant',
      text: 'Hello! I am here to help you digest visually.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestions: [
        'How Mamba and transformer architecture works?',
        'Draw a rate limiter',
        'Draw Microservices Diagram in detils'
      ]
    }
  ])

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    sessionStorage.setItem('OLLAMA_ENDPOINT', ollamaEndpoint)
    localStorage.removeItem('OLLAMA_ENDPOINT')
  }, [ollamaEndpoint])

  useEffect(() => {
    sessionStorage.setItem('OLLAMA_MODEL', ollamaModel)
    localStorage.removeItem('OLLAMA_MODEL')
  }, [ollamaModel])

  useEffect(() => {
    if (ollamaApiKey) {
      sessionStorage.setItem('OLLAMA_API_KEY', ollamaApiKey)
    } else {
      sessionStorage.removeItem('OLLAMA_API_KEY')
    }
    localStorage.removeItem('OLLAMA_API_KEY')
  }, [ollamaApiKey])

  useEffect(() => {
    if (apiKey) {
      sessionStorage.setItem('GEMINI_API_KEY', apiKey)
    } else {
      sessionStorage.removeItem('GEMINI_API_KEY')
    }
    localStorage.removeItem('GEMINI_API_KEY')
  }, [apiKey])

  useEffect(() => {
    sessionStorage.setItem('GEMINI_MODEL', modelName)
    localStorage.removeItem('GEMINI_MODEL')
  }, [modelName])

  const [rawLibraryItems, setRawLibraryItems] = useState<any[]>([])

  useEffect(() => {
    fetch('/my-custom-library.excalidrawlib')
      .then((res) => res.json())
      .then((data) => {
        if (data.libraryItems) {
          setRawLibraryItems(data.libraryItems)
          if (excalidrawAPI) {
            excalidrawAPI.updateLibrary({
              libraryItems: data.libraryItems,
              merge: true
            })
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load default library:', err)
      })
  }, [excalidrawAPI])

  const getCanvasSnapshotBase64 = async (): Promise<string | null> => {
    if (!excalidrawAPI) return null
    const elements = excalidrawAPI.getSceneElements()
    if (!elements || elements.length === 0) return null
    const appState = excalidrawAPI.getAppState()
    const files = excalidrawAPI.getFiles()

    try {
      const { exportToCanvas } = await import('@excalidraw/excalidraw')
      const canvas = await exportToCanvas({
        elements,
        appState: { ...appState, exportBackground: true, exportWithDarkMode: theme === 'dark' },
        files
      })

      const dataUrl = canvas.toDataURL('image/png', 0.8)
      return dataUrl.replace(/^data:image\/png;base64,/, '')
    } catch (e) {
      console.warn('Snapshot generation warning:', e)
      return null
    }
  }

  const handleNewSession = () => {
    const newSid = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    setSessionId(newSid)
    setMessages([
      {
        id: Date.now().toString(),
        sender: 'assistant',
        text: 'Started a fresh session! What would you like to draw next?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestions: [
          'Draw User Authentication Flow',
          'Draw E-Commerce System Architecture',
          'Draw Microservices Diagram'
        ]
      }
    ])

    if (excalidrawAPI) {
      excalidrawAPI.resetScene()
    }
  }

  const handleOpenHistory = async () => {
    setShowHistory(true)
    try {
      if (user) {
        const summaries = await getCloudSessionsSummary(user.id)
        setHistorySummaries(summaries)
      } else {
        const localSummaries = await getAllSessionsSummary()
        setHistorySummaries(localSummaries)
      }
    } catch (e) {
      console.warn('Cloud history unavailable, falling back to local history:', e)
      const localSummaries = await getAllSessionsSummary().catch(() => [])
      setHistorySummaries(localSummaries)
    }
  }

  const handleExportSessionPdf = async (targetSessionId: string) => {
    try {
      let turns: SessionTurnRecord[] = []
      if (user) {
        turns = await getCloudSessionTurns(user.id, targetSessionId).catch(() => getSessionTurns(targetSessionId))
      } else {
        turns = await getSessionTurns(targetSessionId)
      }
      await exportSessionToPdf(targetSessionId, turns)
    } catch (e: any) {
      alert(`PDF Export failed: ${e?.message || 'Unknown error'}`)
    }
  }

  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)

  const confirmDeleteSession = async (targetSessionId: string) => {
    try {
      if (user) {
        await deleteCloudSession(user.id, targetSessionId).catch(() => {})
      }
      await deleteSessionTurns(targetSessionId)
      const updatedSummaries = user
        ? await getCloudSessionsSummary(user.id).catch(() => getAllSessionsSummary())
        : await getAllSessionsSummary()
      setHistorySummaries(updatedSummaries)
    } catch (e) {
      console.error('Failed to delete session:', e)
    }
  }

  const handleRestoreSession = async (targetSessionId: string) => {
    try {
      let turns: SessionTurnRecord[] = []
      if (user) {
        turns = await getCloudSessionTurns(user.id, targetSessionId).catch(() => getSessionTurns(targetSessionId))
      } else {
        turns = await getSessionTurns(targetSessionId)
      }
      if (turns.length === 0) return

      setSessionId(targetSessionId)
      setShowHistory(false)

      const restoredMessages: Message[] = []
      turns.forEach((turn) => {
        restoredMessages.push({
          id: `user_${turn.turn_id}`,
          sender: 'user',
          text: turn.user_prompt,
          timestamp: new Date(turn.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        })
        restoredMessages.push({
          id: `ai_${turn.turn_id}`,
          sender: 'assistant',
          text: turn.chat_reply,
          timestamp: new Date(turn.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        })
      })

      setMessages(restoredMessages)
    } catch (e) {
      console.error('Failed to restore session:', e)
    }
  }

  const handleExportPng = async () => {
    if (!excalidrawAPI) return
    const elements = excalidrawAPI.getSceneElements()
    if (!elements || elements.length === 0) return
    const appState = excalidrawAPI.getAppState()
    const files = excalidrawAPI.getFiles()

    try {
      const { exportToBlob } = await import('@excalidraw/excalidraw')
      const blob = await exportToBlob({
        elements,
        appState: { ...appState, exportBackground: true, exportWithDarkMode: theme === 'dark' },
        files,
        mimeType: 'image/png',
        quality: 0.92
      })

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `excalidraw-diagram-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Failed to export canvas image:', e)
    }
  }

  const handleSend = async (textToSend?: string) => {
    const query = textToSend || input
    if (!query.trim() || isLoading) return

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    setMessages((prev) => [...prev, userMsg])
    if (!textToSend) setInput('')

    if (provider === 'gemini' && !apiKey.trim()) {
      setTimeout(() => {
        const warningMsg: Message = {
          id: (Date.now() + 1).toString(),
          sender: 'assistant',
          text: '🔑 Please set your Gemini API Key in the top-right Settings (⚙️) panel to generate diagrams.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
        setMessages((prev) => [...prev, warningMsg])
      }, 300)
      setShowSettings(true)
      return
    }

    setIsLoading(true)

    try {
      let result: { chatReply: string; elements: any[] }

      if (provider === 'ollama') {
        result = await generateDiagramWithOllama(query, ollamaEndpoint, ollamaModel, ollamaApiKey, rawLibraryItems)
      } else {
        result = await generateDiagramFromPrompt(query, apiKey, modelName || 'gemini-3.1-flash-lite', rawLibraryItems)
      }

      if (excalidrawAPI) {
        excalidrawAPI.updateScene({
          elements: result.elements,
          appState: {
            selectedElementIds: {}
          },
          commitToHistory: true,
          scrollToContent: true
        })
      }

      // Capture PNG snapshot for session_turns record
      let snapshotDataUrl = ''
      try {
        const base64 = await getCanvasSnapshotBase64()
        if (base64) {
          snapshotDataUrl = `data:image/png;base64,${base64}`
        }
      } catch (e) {}

      const turnId = `turn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
      const record: SessionTurnRecord = {
        session_id: sessionId,
        turn_id: turnId,
        user_prompt: query,
        chat_reply: result.chatReply,
        image_blob: snapshotDataUrl,
        created_at: new Date().toISOString()
      }

      // Active Session local cache
      await saveSessionTurn(record).catch((e) => console.warn('Failed to auto-save local turn cache:', e))

      // Cloud Persistence with RLS Authorization
      if (user) {
        await saveCloudSessionTurn(user.id, record).catch((e) => console.error('Failed to save turn to Supabase cloud:', e))
      }

      const aiReply: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: result.chatReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
      setMessages((prev) => [...prev, aiReply])
    } catch (error: any) {
      console.error('Diagram generation error:', error)
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: `❌ Error: ${error?.message || 'Failed to generate diagram.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null)

  const handleCopy = (msgId: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedMsgId(msgId)
    setTimeout(() => setCopiedMsgId(null), 2000)
  }

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSettings(false)
        setShowHistory(false)
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  return (
    <div className="app-container">
      {/* 100% Full-Width Top Page Header */}
      <AppHeader
        currentPath="/"
        onNavigate={onNavigate}
        provider={provider}
        setProvider={setProvider}
        isLoading={isLoading}
        onOpenHistory={handleOpenHistory}
        onOpenSettings={() => setShowSettings(true)}
        onExportPng={handleExportPng}
        onNewSession={handleNewSession}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        isCanvasFrozen={isCanvasFrozen}
        onToggleCanvasLock={() => setIsCanvasFrozen(!isCanvasFrozen)}
        ollamaModel={ollamaModel}
        modelName={modelName}
      />

      {/* Settings Popup Window */}
      {showSettings && (
        <div className="popup-overlay" onClick={() => setShowSettings(false)}>
          <div className="popup-window" onClick={(e) => e.stopPropagation()}>
            <div className="popup-header">
              <h3>⚙️ AI Provider Settings</h3>
              <button className="popup-close-btn" onClick={() => setShowSettings(false)}>✕</button>
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
                      ollamaEndpoint === 'http://localhost:11434' || ollamaEndpoint === 'http://localhost:11434/'
                        ? 'http://localhost:11434'
                        : ollamaEndpoint === 'https://ollama.com' || ollamaEndpoint === 'https://ollama.com/'
                        ? 'https://ollama.com'
                        : 'custom'
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val !== 'custom') {
                        setOllamaEndpoint(val);
                      }
                    }}
                  >
                    <option value="http://localhost:11434">🦙 Ollama Localhost (http://localhost:11434)</option>
                    <option value="https://ollama.com">☁️ Ollama Cloud (https://ollama.com)</option>
                    <option value="custom">⚙️ Custom Server / Cloud Proxy URL...</option>
                  </select>

                  <label>Ollama Host URL</label>
                  <input
                    type="text"
                    value={ollamaEndpoint}
                    onChange={(e) => setOllamaEndpoint(e.target.value)}
                    placeholder="http://localhost:11434"
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
                    For local Ollama, ensure CORS is enabled: <code>$env:OLLAMA_ORIGINS="*"</code>
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
              <button className="popup-done-btn" onClick={() => setShowSettings(false)}>Save & Close</button>
            </div>
          </div>
        </div>
      )}

      {/* History Popup Window */}
      {showHistory && (
        <div className="popup-overlay" onClick={() => setShowHistory(false)}>
          <div className="popup-window history-popup" onClick={(e) => e.stopPropagation()}>
            <div className="popup-header">
              <h3>📁 Saved Diagram History</h3>
              <button className="popup-close-btn" onClick={() => setShowHistory(false)}>✕</button>
            </div>

            <div className="popup-body">
              {historySummaries.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#9ca3af', padding: '30px' }}>
                  No saved diagram sessions found.
                </div>
              ) : (
                <div className="history-list">
                  {historySummaries.map((summary) => (
                    <div
                      key={summary.session_id}
                      className={`history-card ${summary.session_id === sessionId ? 'active-session' : ''}`}
                    >
                      <div className="history-info">
                        <div className="history-title">{summary.first_prompt}</div>
                        <div className="history-meta">
                          <span>🔄 {summary.turn_count} {summary.turn_count === 1 ? 'turn' : 'turns'}</span>
                          <span>•</span>
                          <span>🕒 {new Date(summary.latest_created_at).toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="history-actions">
                        <button
                          className="history-btn restore-btn"
                          onClick={() => handleRestoreSession(summary.session_id)}
                          title="Restore this session to Canvas"
                        >
                          👁️ View
                        </button>
                        <button
                          className="history-btn pdf-btn"
                          onClick={() => handleExportSessionPdf(summary.session_id)}
                          title="Export Session as PDF Report"
                        >
                          📄 PDF
                        </button>
                        <button
                          className="history-btn delete-btn"
                          onClick={() => setDeletingSessionId(summary.session_id)}
                          title="Delete Session"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="popup-footer">
              <button className="popup-done-btn" onClick={() => setShowHistory(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Popup Window */}
      {deletingSessionId && (
        <div className="popup-overlay" onClick={() => setDeletingSessionId(null)}>
          <div className="popup-window" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px', textAlign: 'center' }}>
            <div className="popup-header" style={{ justifyContent: 'center' }}>
              <h3 style={{ color: '#ef4444' }}>🗑️ Confirm Deletion</h3>
            </div>
            <div className="popup-body" style={{ padding: '20px 10px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              Are you sure you want to permanently delete this diagram session? This action cannot be undone.
            </div>
            <div className="popup-footer" style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                className="popup-done-btn"
                style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                onClick={() => setDeletingSessionId(null)}
              >
                Cancel
              </button>
              <button
                className="popup-done-btn"
                style={{ background: '#ef4444', color: '#ffffff' }}
                onClick={() => {
                  if (deletingSessionId) {
                    confirmDeleteSession(deletingSessionId);
                    setDeletingSessionId(null);
                  }
                }}
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace (70% Excalidraw / 30% Chat Panel) */}
      <main className="main-workspace">
        {/* Left 70% Pane: Excalidraw Canvas */}
        <div className="excalidraw-wrapper">
          <Excalidraw
            excalidrawAPI={(api) => {
              setExcalidrawAPI(api)
              if (rawLibraryItems.length > 0) {
                api.updateLibrary({
                  libraryItems: rawLibraryItems,
                  merge: true
                })
              }
            }}
            viewModeEnabled={isCanvasFrozen}
            theme={theme}
          />
        </div>

        {/* Right 30% Pane: AI Copilot Chat Interface */}
        <div className="chat-container">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>💬 Visual Intel</h3>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }} title={sessionId}>ID: {sessionId.substring(0, 10)}...</span>
          </div>

          <div className="chat-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={`message ${msg.sender}`}>
                <div className="avatar">
                  {msg.sender === 'assistant' ? 'AI' : 'U'}
                </div>
                <div className="message-content">
                  <div className="message-bubble" style={{ position: 'relative', whiteSpace: 'pre-wrap' }}>
                    {msg.sender === 'assistant' && (
                      <button
                        className="copy-msg-btn"
                        onClick={() => handleCopy(msg.id, msg.text)}
                        title="Copy response text"
                      >
                        {copiedMsgId === msg.id ? '✓ Copied' : '📋 Copy'}
                      </button>
                    )}
                    {msg.text}
                  </div>
                  {msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="quick-prompts">
                      {msg.suggestions.map((suggestion, idx) => (
                        <button
                          key={idx}
                          className="quick-prompt-btn"
                          onClick={() => handleSend(suggestion)}
                          disabled={isLoading}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-container">
            <div className="chat-input-wrapper">
              <textarea
                className="chat-input"
                placeholder={isLoading ? "Generating diagram..." : "Ask AI to draw or edit..."}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                rows={3}
              />
              <button
                className="send-btn"
                onClick={() => handleSend()}
                disabled={isLoading}
                aria-label="Send message"
              >
                {isLoading ? (
                  <span className="spinner"></span>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                )}
              </button>
            </div>
            <div className="chat-footer-hint">
              Press Enter to send • Shift+Enter for new line
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function AppContent() {
  const { user, loading, isConfigured } = useAuth()
  const [currentPath, setCurrentPath] = useState<string>(() => window.location.pathname)

  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname)
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = (path: string) => {
    window.history.pushState({}, '', path)
    setCurrentPath(path)
  }

  if (!isConfigured) {
    return <ConfigMissingScreen />
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
        backgroundColor: '#090d16',
        color: '#38bdf8',
        fontSize: '1.2rem',
        fontWeight: 600
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <div className="spinner" style={{ width: '32px', height: '32px', border: '3px solid rgba(56, 189, 248, 0.2)', borderTopColor: '#38bdf8', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <div>Initializing Supabase Auth...</div>
        </div>
      </div>
    )
  }

  if (!user) {
    return <AuthLandingView />
  }

  if (currentPath === '/voice') {
    return <VoiceWorkspace onNavigate={navigate} />
  }

  return <MainWorkspace onNavigate={navigate} />
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
