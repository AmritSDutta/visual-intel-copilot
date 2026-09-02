import { useState, useEffect } from 'react'
import '@excalidraw/excalidraw/index.css'
import './App.css'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ConfigMissingScreen } from './components/ConfigMissingScreen'
import { AuthLandingView } from './components/AuthLandingView'
import { VoiceWorkspace } from './components/VoiceWorkspace'
import { AgenticWorkspace } from './components/AgenticWorkspace'
import { AppHeader } from './components/AppHeader'
import { SettingsModal } from './components/SettingsModal'
import { HistoryModal } from './components/HistoryModal'
import { DeleteConfirmModal } from './components/DeleteConfirmModal'
import { ExcalidrawCanvas } from './components/ExcalidrawCanvas'
import { ChatPanel } from './components/ChatPanel'
import { useMainWorkspace } from './hooks/useMainWorkspace'

interface MainWorkspaceProps {
  onNavigate?: (path: string) => void
}

function MainWorkspace({ onNavigate }: MainWorkspaceProps) {
  const ws = useMainWorkspace()

  return (
    <div className="app-container">
      {/* 100% Full-Width Top Page Header */}
      <AppHeader
        currentPath="/"
        onNavigate={onNavigate}
        provider={ws.provider}
        setProvider={ws.setProvider}
        isLoading={ws.isLoading}
        onOpenHistory={ws.handleOpenHistory}
        onOpenSettings={() => ws.setShowSettings(true)}
        onExportPng={ws.handleExportPng}
        onNewSession={ws.handleNewSession}
        theme={ws.theme}
        onToggleTheme={() => ws.setTheme(ws.theme === 'dark' ? 'light' : 'dark')}
        isCanvasFrozen={ws.isCanvasFrozen}
        onToggleCanvasLock={() => ws.setIsCanvasFrozen(!ws.isCanvasFrozen)}
        ollamaModel={ws.ollamaModel}
        modelName={ws.modelName}
      />

      {/* Settings Popup Window */}
      <SettingsModal
        open={ws.showSettings}
        onClose={() => ws.setShowSettings(false)}
        provider={ws.provider}
        setProvider={ws.setProvider}
        ollamaEndpoint={ws.ollamaEndpoint}
        setOllamaEndpoint={ws.setOllamaEndpoint}
        ollamaModel={ws.ollamaModel}
        setOllamaModel={ws.setOllamaModel}
        ollamaApiKey={ws.ollamaApiKey}
        setOllamaApiKey={ws.setOllamaApiKey}
        apiKey={ws.apiKey}
        setApiKey={ws.setApiKey}
        modelName={ws.modelName}
        setModelName={ws.setModelName}
      />

      {/* History Popup Window */}
      <HistoryModal
        open={ws.showHistory}
        onClose={() => ws.setShowHistory(false)}
        sessionId={ws.sessionId}
        historySummaries={ws.historySummaries}
        onRestoreSession={ws.handleRestoreSession}
        onExportSessionPdf={ws.handleExportSessionPdf}
        onRequestDeleteSession={(id) => ws.setDeletingSessionId(id)}
      />

      {/* Delete Confirmation Popup Window */}
      <DeleteConfirmModal
        sessionId={ws.deletingSessionId}
        onCancel={() => ws.setDeletingSessionId(null)}
        onConfirm={async (id) => {
          await ws.confirmDeleteSession(id)
          ws.setDeletingSessionId(null)
        }}
      />

      {/* Main Workspace (70% Excalidraw / 30% Chat Panel) */}
      <main className="main-workspace">
        <ExcalidrawCanvas
          onApiReady={ws.setExcalidrawAPI}
          rawLibraryItems={ws.rawLibraryItems}
          isCanvasFrozen={ws.isCanvasFrozen}
          theme={ws.theme}
        />

        <ChatPanel
          sessionId={ws.sessionId}
          messages={ws.messages}
          input={ws.input}
          setInput={ws.setInput}
          isLoading={ws.isLoading}
          copiedMsgId={ws.copiedMsgId}
          messagesEndRef={ws.messagesEndRef}
          onSend={ws.handleSend}
          onKeyDown={ws.handleKeyDown}
          onCopy={ws.handleCopy}
        />
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

  if (currentPath === '/agentic') {
    return <AgenticWorkspace onNavigate={navigate} />
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
