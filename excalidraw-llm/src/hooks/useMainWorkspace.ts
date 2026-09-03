import { useState, useEffect, useRef, type KeyboardEvent } from 'react'
import { exportToCanvas, exportToBlob } from '@excalidraw/excalidraw'
import { generateDiagramFromPrompt, generateDiagramWithOllama } from '../services/aiService'
import { saveSessionTurn } from '../services/sessionDbService'
import type { SessionTurnRecord } from '../services/sessionDbService'
import { useAuth } from '../context/AuthContext'
import { saveCloudSessionTurn } from '../services/supabaseDbService'
import type { Message } from '../types/chat'
import { useSettings } from './useSettings'
import { useSessionHistory } from './useSessionHistory'

type ExcalidrawAPI = {
  getSceneElements: () => readonly unknown[]
  getAppState: () => unknown
  getFiles: () => unknown
  resetScene: () => void
  updateScene: (opts: unknown) => void
  updateLibrary: (opts: unknown) => void
}

export function useMainWorkspace() {
  const { user } = useAuth()
  
  // Domain sub-hooks
  const settings = useSettings()

  // State declarations
  const [input, setInput] = useState('')
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawAPI | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => 
    (localStorage.getItem('APP_THEME') as 'dark' | 'light') || 'dark'
  )
  const [isLoading, setIsLoading] = useState(false)
  const [isCanvasFrozen, setIsCanvasFrozen] = useState(true)
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null)
  const [rawLibraryItems, setRawLibraryItems] = useState<readonly unknown[]>([])
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

  // Session history sub-hook
  const history = useSessionHistory(
    user,
    // onSessionReset
    () => {
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
    },
    // onTurnsRestored
    (turns) => {
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
    }
  )

  // Theme synchronization
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('APP_THEME', theme)
  }, [theme])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Load custom library
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

  // Global escape key listener
  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        settings.setShowSettings(false)
        history.setShowHistory(false)
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [settings, history])

  const getCanvasSnapshotBase64 = async (): Promise<string | null> => {
    if (!excalidrawAPI) return null
    const elements = excalidrawAPI.getSceneElements()
    if (!elements || elements.length === 0) return null
    const appState = excalidrawAPI.getAppState() as any
    const files = excalidrawAPI.getFiles() as any

    try {
      const canvas = await exportToCanvas({
        elements: elements as any,
        appState: { ...appState, exportBackground: true, exportWithDarkMode: theme === 'dark' },
        files
      })

      const dataUrl = canvas.toDataURL('image/png')
      return dataUrl.replace(/^data:image\/png;base64,/, '')
    } catch (e) {
      console.warn('Snapshot generation warning:', e)
      return null
    }
  }

  const handleExportPng = async () => {
    if (!excalidrawAPI) return
    const elements = excalidrawAPI.getSceneElements()
    if (!elements || elements.length === 0) return
    const appState = excalidrawAPI.getAppState() as any
    const files = excalidrawAPI.getFiles() as any

    try {
      const blob = await exportToBlob({
        elements: elements as any,
        appState: { ...appState, exportBackground: true, exportWithDarkMode: theme === 'dark' },
        files,
        mimeType: 'image/png'
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

    if (settings.provider === 'gemini' && !settings.apiKey.trim()) {
      setTimeout(() => {
        const warningMsg: Message = {
          id: (Date.now() + 1).toString(),
          sender: 'assistant',
          text: '🔑 Please set your Gemini API Key in the top-right Settings (⚙️) panel to generate diagrams.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
        setMessages((prev) => [...prev, warningMsg])
      }, 300)
      settings.setShowSettings(true)
      return
    }

    setIsLoading(true)

    try {
      let result: { chatReply: string; elements: unknown[] }

      if (settings.provider === 'ollama') {
        result = await generateDiagramWithOllama(
          query,
          settings.ollamaEndpoint,
          settings.ollamaModel,
          settings.ollamaApiKey,
          rawLibraryItems as any[]
        )
      } else {
        result = await generateDiagramFromPrompt(
          query,
          settings.apiKey,
          settings.modelName || 'gemini-3.1-flash-lite',
          rawLibraryItems as any[]
        )
      }

      if (excalidrawAPI && Array.isArray(result.elements) && result.elements.length > 0) {
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
      } catch (snapshotErr) {
        console.warn('Failed to capture snapshot for session turn:', snapshotErr)
      }

      const turnId = `turn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
      const record: SessionTurnRecord = {
        session_id: history.sessionId,
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
    } catch (error: unknown) {
      console.error('Diagram generation error:', error)
      const errorMsgText = error instanceof Error ? error.message : 'Failed to generate diagram.'
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: `❌ Error: ${errorMsgText}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleCopy = (msgId: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedMsgId(msgId)
    setTimeout(() => setCopiedMsgId(null), 2000)
  }

  return {
    // Settings state
    provider: settings.provider,
    setProvider: settings.setProvider,
    ollamaEndpoint: settings.ollamaEndpoint,
    setOllamaEndpoint: settings.setOllamaEndpoint,
    ollamaModel: settings.ollamaModel,
    setOllamaModel: settings.setOllamaModel,
    ollamaApiKey: settings.ollamaApiKey,
    setOllamaApiKey: settings.setOllamaApiKey,
    apiKey: settings.apiKey,
    setApiKey: settings.setApiKey,
    modelName: settings.modelName,
    setModelName: settings.setModelName,
    showSettings: settings.showSettings,
    setShowSettings: settings.setShowSettings,

    // Session history state & actions
    sessionId: history.sessionId,
    showHistory: history.showHistory,
    setShowHistory: history.setShowHistory,
    historySummaries: history.historySummaries,
    deletingSessionId: history.deletingSessionId,
    setDeletingSessionId: history.setDeletingSessionId,
    handleNewSession: history.handleNewSession,
    handleOpenHistory: history.handleOpenHistory,
    handleExportSessionPdf: history.handleExportSessionPdf,
    confirmDeleteSession: history.confirmDeleteSession,
    handleRestoreSession: history.handleRestoreSession,

    // Theme
    theme,
    setTheme,

    // Canvas
    excalidrawAPI,
    setExcalidrawAPI,
    isCanvasFrozen,
    setIsCanvasFrozen,
    rawLibraryItems,
    handleExportPng,

    // Chat
    input,
    setInput,
    messages,
    isLoading,
    messagesEndRef,
    copiedMsgId,
    handleCopy,
    handleSend,
    handleKeyDown
  }
}
