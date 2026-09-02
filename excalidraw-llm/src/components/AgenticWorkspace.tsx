import { useState, useEffect, useRef, useCallback } from 'react';
import { Excalidraw, exportToBlob } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import '../App.css';
import {
  AdkLiveAgent,
  GROQ_MODELS,
  MISTRAL_MODELS,
  BrowserVAD,
  appLogger,
  type LogEntry,
  type SubagentActivityEvent,
  type AdkAgentState
} from '../aiServices';
import { saveSessionTurn, getSessionTurns, getAllSessionsSummary, deleteSessionTurns } from '../services/sessionDbService';
import type { SessionSummary, SessionTurnRecord } from '../services/sessionDbService';
import { exportSessionToPdf } from '../services/pdfExportService';
import { useAuth } from '../context/AuthContext';
import { saveCloudSessionTurn, getCloudSessionsSummary, getCloudSessionTurns, deleteCloudSession } from '../services/supabaseDbService';
import { AppHeader } from './AppHeader';
import { HistoryModal } from './HistoryModal';
import {
  createSpeechRecognizer,
  speakNativeAudioResponse,
  stopAudioResponse,
  unlockAudioContext,
  GEMINI_LIVE_MODELS,
  STUDIO_VOICES,
  type SpeechRecognitionController
} from '../services/voiceService';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  subagentBadge?: string;
  suggestions?: string[];
  isVoiceReply?: boolean;
}

interface AgenticWorkspaceProps {
  onNavigate: (path: string) => void;
}

export function AgenticWorkspace({ onNavigate }: AgenticWorkspaceProps) {
  const { user } = useAuth();
  const [excalidrawAPI, setExcalidrawAPI] = useState<unknown>(null);

  // Active Session state
  const [sessionId, setSessionId] = useState<string>(
    () => `agentic_sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
  );
  const [showHistory, setShowHistory] = useState(false);
  const [historySummaries, setHistorySummaries] = useState<SessionSummary[]>([]);

  // Layout UI state
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [showLogsDrawer, setShowLogsDrawer] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>(() => appLogger.getLogs());

  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('APP_THEME') as 'dark' | 'light') || 'dark'
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('APP_THEME', theme);
  }, [theme]);

  // Subscribe to real-time app logger events
  useEffect(() => {
    const unsubscribe = appLogger.subscribe((allLogs) => {
      setLogs(allLogs);
    });
    return () => unsubscribe();
  }, []);

  // Provider & Multi-Agent settings state
  const [settingsActiveCard, setSettingsActiveCard] = useState<'gemini' | 'groq' | 'mistral'>('gemini');

  const [apiKey, setApiKey] = useState<string>(
    () => sessionStorage.getItem('GEMINI_API_KEY') || ''
  );
  const [groqApiKey, setGroqApiKey] = useState<string>(
    () => sessionStorage.getItem('GROQ_API_KEY') || ''
  );
  const [groqModel, setGroqModel] = useState<string>(() => {
    const saved = sessionStorage.getItem('GROQ_MODEL');
    if (saved && GROQ_MODELS.some((m) => m.id === saved)) {
      return saved;
    }
    return GROQ_MODELS[0].id;
  });

  const [mistralApiKey, setMistralApiKey] = useState<string>(
    () => sessionStorage.getItem('MISTRAL_API_KEY') || ''
  );
  const [mistralModel, setMistralModel] = useState<string>(() => {
    const saved = sessionStorage.getItem('MISTRAL_MODEL');
    if (saved && MISTRAL_MODELS.some((m: { id: string }) => m.id === saved)) {
      return saved;
    }
    return MISTRAL_MODELS[0].id;
  });

  const [modelName, setModelName] = useState<string>(
    () => sessionStorage.getItem('GEMINI_MODEL') || GEMINI_LIVE_MODELS[0].id
  );
  const [browserSpeechEnabled, setBrowserSpeechEnabled] = useState<boolean>(
    () => sessionStorage.getItem('BROWSER_SPEECH_FALLBACK') !== 'false'
  );

  // Audio Studio specific states
  const [studioVoice, setStudioVoice] = useState<string>(
    () => sessionStorage.getItem('STUDIO_VOICE') || 'Puck'
  );
  const [autoListen, setAutoListen] = useState<boolean>(
    () => sessionStorage.getItem('AUTO_LISTEN') !== 'false'
  );
  const [isVadActive, setIsVadActive] = useState(false);

  const [isMuted, setIsMuted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCanvasFrozen, setIsCanvasFrozen] = useState(true);

  // Voice Live Agent States
  const [isLiveAgentRunning, setIsLiveAgentRunning] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string>('Click Start Live Audio Studio to begin');
  const [activeSubagentEvent, setActiveSubagentEvent] = useState<SubagentActivityEvent | null>(null);
  const [rawLibraryItems, setRawLibraryItems] = useState<unknown[]>([]);

  const [audioLevel, setAudioLevel] = useState<number>(0);

  const recognizerRef = useRef<SpeechRecognitionController | null>(null);
  const liveAgentRef = useRef<AdkLiveAgent | null>(null);
  const vadRef = useRef<BrowserVAD | null>(null);
  const isProcessingVoiceRef = useRef<boolean>(false);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      sender: 'assistant',
      text: '🎙️ Welcome to the Audio Studio! Click "Start Live Audio Studio" above and speak any architecture or system design request hands-free (e.g. "Draw a real-time event streaming pipeline with Kafka and Redis").',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestions: [
        'Draw high-scale Kafka stream architecture',
        'Design payment gateway with Stripe and Postgres',
        'What is currently on the canvas?'
      ]
    }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (showLogsDrawer) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showLogsDrawer]);

  useEffect(() => {
    if (apiKey) sessionStorage.setItem('GEMINI_API_KEY', apiKey);
    else sessionStorage.removeItem('GEMINI_API_KEY');
  }, [apiKey]);

  useEffect(() => {
    if (groqApiKey) sessionStorage.setItem('GROQ_API_KEY', groqApiKey);
    else sessionStorage.removeItem('GROQ_API_KEY');
  }, [groqApiKey]);

  useEffect(() => {
    sessionStorage.setItem('GROQ_MODEL', groqModel);
  }, [groqModel]);

  useEffect(() => {
    if (mistralApiKey) sessionStorage.setItem('MISTRAL_API_KEY', mistralApiKey);
    else sessionStorage.removeItem('MISTRAL_API_KEY');
  }, [mistralApiKey]);

  useEffect(() => {
    sessionStorage.setItem('MISTRAL_MODEL', mistralModel);
  }, [mistralModel]);

  useEffect(() => {
    sessionStorage.setItem('STUDIO_VOICE', studioVoice);
  }, [studioVoice]);

  useEffect(() => {
    sessionStorage.setItem('AUTO_LISTEN', String(autoListen));
  }, [autoListen]);

  useEffect(() => {
    sessionStorage.setItem('GEMINI_MODEL', modelName);
  }, [modelName]);

  useEffect(() => {
    sessionStorage.setItem('BROWSER_SPEECH_FALLBACK', String(browserSpeechEnabled));
  }, [browserSpeechEnabled]);

  useEffect(() => {
    fetch('/my-custom-library.excalidrawlib')
      .then((res) => (res.ok ? res.json() : null))
      .then((lib) => {
        if (lib && lib.libraryItems) {
          setRawLibraryItems(lib.libraryItems);
          if (excalidrawAPI) {
            (excalidrawAPI as any).updateLibrary({
              libraryItems: lib.libraryItems,
              merge: true
            });
          }
        }
      })
      .catch((err) => appLogger.warn('LIBRARY', `Stencil auto-load notice: ${err}`));
  }, [excalidrawAPI]);

  // Canvas Snapshot capture for PDF and Session persistence
  const getCanvasSnapshot = useCallback(async (): Promise<string | null> => {
    if (!excalidrawAPI) return null;
    try {
      const elements = (excalidrawAPI as any).getSceneElements();
      if (!elements || elements.length === 0) return null;
      const appState = (excalidrawAPI as any).getAppState();
      const files = (excalidrawAPI as any).getFiles();

      const blob = await exportToBlob({
        elements,
        appState: { ...appState, exportBackground: true, exportWithDarkMode: theme === 'dark' },
        files,
        mimeType: 'image/png',
        quality: 0.85
      });

      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      appLogger.warn('SNAPSHOT', `Snapshot capture notice: ${e}`);
      return null;
    }
  }, [excalidrawAPI, theme]);

  // Memoized Live Agent getter / lazy initializer
  const getOrCreateLiveAgent = useCallback(() => {
    const config = {
      sessionId,
      geminiApiKey: apiKey,
      groqApiKey,
      mistralApiKey,
      geminiModel: modelName,
      groqModel,
      mistralModel,
      studioVoice,
      rawLibraryItems,
      browserSpeechFallback: true,
      context: {
        sessionId,
        rawLibraryItems,
        getCanvasElements: () => ((excalidrawAPI as any)?.getSceneElements?.() || []),
        getCanvasSnapshotBase64: getCanvasSnapshot,
        setCanvasElements: (elements: any[]) => {
          (excalidrawAPI as any)?.updateScene?.({ elements, scrollToContent: true });
        }
      }
    };

    const callbacks = {
      onStateChange: (agentState: AdkAgentState) => {
        setIsSpeaking(agentState === 'speaking');
      },
      onSubagentActivity: (ev: SubagentActivityEvent) => {
        setActiveSubagentEvent(ev);
      }
    };

    const agent = AdkLiveAgent.getOrCreateInstance(config, callbacks);
    liveAgentRef.current = agent;
    return agent;
  }, [sessionId, apiKey, groqApiKey, mistralApiKey, modelName, groqModel, mistralModel, studioVoice, rawLibraryItems, excalidrawAPI, getCanvasSnapshot]);

  // Synchronize Live Agent configuration ONLY when session is actively running
  useEffect(() => {
    if (isLiveAgentRunning) {
      getOrCreateLiveAgent();
    }
  }, [isLiveAgentRunning, getOrCreateLiveAgent]);

  const loadHistorySummaries = useCallback(async () => {
    if (user) {
      try {
        const cloudSummaries = await getCloudSessionsSummary(user.id);
        setHistorySummaries(cloudSummaries);
        return;
      } catch (err) {
        appLogger.warn('HISTORY', `Cloud session listing notice: ${err}`);
      }
    }
    const localSummaries = await getAllSessionsSummary();
    setHistorySummaries(localSummaries);
  }, [user]);

  const handleOpenHistory = () => {
    loadHistorySummaries();
    setShowHistory(true);
  };

  const handleRestoreSession = async (targetSessionId: string) => {
    stopAudioResponse();
    let turns: SessionTurnRecord[] = [];
    if (user) {
      try {
        turns = await getCloudSessionTurns(user.id, targetSessionId);
      } catch (err) {
        appLogger.warn('RESTORE', `Cloud restore fallback: ${err}`);
      }
    }
    if (turns.length === 0) {
      turns = await getSessionTurns(targetSessionId);
    }
    if (turns.length === 0) return;

    const restoredMessages: Message[] = [];

    turns.forEach((turn, idx) => {
      restoredMessages.push({
        id: `restored_u_${idx}`,
        sender: 'user',
        text: turn.user_prompt,
        timestamp: new Date(turn.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
      restoredMessages.push({
        id: `restored_a_${idx}`,
        sender: 'assistant',
        text: turn.chat_reply,
        timestamp: new Date(turn.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    });

    setSessionId(targetSessionId);
    setMessages(restoredMessages);
    if (liveAgentRef.current) {
      liveAgentRef.current.resetSession(targetSessionId);
    }
    setShowHistory(false);
  };

  const handleDeleteSession = async (targetSessionId: string) => {
    if (user) {
      try {
        await deleteCloudSession(user.id, targetSessionId);
      } catch (err) {
        appLogger.warn('DELETE', `Cloud delete notice: ${err}`);
      }
    }
    await deleteSessionTurns(targetSessionId);
    loadHistorySummaries();
    if (sessionId === targetSessionId) {
      handleNewSession();
    }
  };

  const handleExportPdf = async (targetSessionId: string) => {
    let turns: SessionTurnRecord[] = [];
    if (user) {
      try {
        turns = await getCloudSessionTurns(user.id, targetSessionId);
      } catch (err) {
        appLogger.warn('PDF', `Cloud PDF turns notice: ${err}`);
      }
    }
    if (turns.length === 0) {
      turns = await getSessionTurns(targetSessionId);
    }
    if (turns.length === 0) return;
    exportSessionToPdf(targetSessionId, turns);
  };

  const handleNewSession = () => {
    stopAudioResponse();
    recognizerRef.current?.stop();
    vadRef.current?.stop();
    setIsLiveAgentRunning(false);
    setIsListening(false);
    setIsSpeaking(false);
    setIsVadActive(false);
    setAudioLevel(0);
    setVoiceStatus('Click Start Live Audio Studio to begin');

    AdkLiveAgent.releaseInstance();
    liveAgentRef.current = null;
    const newId = `agentic_sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setSessionId(newId);
    setMessages([
      {
        id: '1',
        sender: 'assistant',
        text: 'New session started. Post any text notes in chat, or click "Start Live Agent" to talk to me.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestions: [
          'Check the chat and draw that system',
          'What is currently on the canvas?',
          'Draw Serverless Microservices Flow'
        ]
      }
    ]);
    if (excalidrawAPI) {
      (excalidrawAPI as any).updateScene({ elements: [] });
    }
  };

  const handleExportPng = async () => {
    if (!excalidrawAPI) return;
    const api = excalidrawAPI as { getSceneElements: () => unknown[]; getAppState: () => unknown; getFiles: () => unknown };
    const elements = api.getSceneElements();
    if (!elements || elements.length === 0) return;
    const appState = api.getAppState();
    const files = api.getFiles();

    try {
      const blob = await exportToBlob({
        elements: elements as Parameters<typeof exportToBlob>[0]['elements'],
        appState: { ...(appState as object), exportBackground: true, exportWithDarkMode: theme === 'dark' },
        files: files as Parameters<typeof exportToBlob>[0]['files'],
        mimeType: 'image/png',
        quality: 0.92
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agentic-diagram-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      appLogger.error('EXPORT', `Failed to export canvas image: ${e}`);
    }
  };

  // 🎙️ VOICE LIVE AGENT EXECUTION HANDLER
  const handleVoiceCommand = async (spokenText: string) => {
    if (!spokenText.trim() || isMuted) return;

    // Immediately stop ongoing audio on new voice input (interruption)
    stopAudioResponse();
    unlockAudioContext();

    appLogger.info('VOICE_TURN', `Handling voice turn: "${spokenText}"`);

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: spokenText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setVoiceStatus('⚡ Live Agent executing command & orchestrating tools...');

    try {
      const agent = liveAgentRef.current || getOrCreateLiveAgent();
      const result = await agent.processUserPrompt(spokenText, { isVoiceInput: true });

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: result.chatReply,
        subagentBadge: result.subagentBadge,
        isVoiceReply: true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, assistantMsg]);

      setTimeout(async () => {
        const snapshot = await getCanvasSnapshot();
        const turnRecord: SessionTurnRecord = {
          session_id: sessionId,
          turn_id: `turn_${Date.now()}`,
          user_prompt: spokenText,
          chat_reply: result.chatReply,
          image_blob: snapshot || '',
          created_at: new Date().toISOString()
        };

        if (user) {
          saveCloudSessionTurn(user.id, turnRecord).catch(() => {});
        }
        saveSessionTurn(turnRecord).catch(() => {});
      }, 500);

    } catch (err: any) {
      appLogger.error('VOICE_ERROR', `Turn execution failed: ${err.message}`, err);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: `❌ Generation Error: ${err.message || 'Failed to complete voice command.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      isProcessingVoiceRef.current = false;
      setVoiceStatus('🎙️ Listening... Speak your next command');
      setTimeout(() => setActiveSubagentEvent(null), 3000);

      // Auto-listen loop: keep listening if studio is on-air and autoListen is active
      if (autoListen && isLiveAgentRunning && recognizerRef.current) {
        try {
          recognizerRef.current.start();
          setIsListening(true);
        } catch {}
      }
    }
  };

  // 🎙️ START / STOP LIVE AGENT TAKEOVER
  const toggleLiveAgentSession = () => {
    unlockAudioContext();

    if (isLiveAgentRunning) {
      appLogger.info('LIVE_AGENT', 'Stopping Live Agent Voice session');
      recognizerRef.current?.stop();
      vadRef.current?.stop();
      stopAudioResponse();
      setIsLiveAgentRunning(false);
      setIsListening(false);
      setIsSpeaking(false);
      setIsVadActive(false);
      setAudioLevel(0);
      liveAgentRef.current?.setVoiceActive(false);
      AdkLiveAgent.releaseInstance();
      liveAgentRef.current = null;
      setVoiceStatus('Live Audio Studio stopped. Click Start to resume.');
    } else {
      if (!apiKey.trim() && !groqApiKey.trim() && !mistralApiKey.trim()) {
        appLogger.warn('AUTH', 'No API keys provided, opening Settings');
        setShowSettings(true);
        return;
      }

      appLogger.info('LIVE_AGENT', 'Starting Live Agent Voice session');
      setIsLiveAgentRunning(true);
      const agent = getOrCreateLiveAgent();
      agent.setVoiceActive(true);

      // 1. Start Web Audio RMS VAD Engine
      const vad = new BrowserVAD({
        onAudioLevel: (level) => {
          setAudioLevel(level);
          setIsVadActive(level > 0.05);
        },
        onVoiceStart: () => {
          setIsVadActive(true);
          appLogger.info('VAD', 'Voice detected (speech started)');
        },
        onVoiceEnd: () => {
          setIsVadActive(false);
          appLogger.info('VAD', 'Silence detected after speech');
        }
      });
      vadRef.current = vad;
      vad.start();

      // 2. Deliver warm spoken greeting immediately upon session start
      agent.greetUserOnLiveStart();

      // 3. Start Continuous Speech Recognition
      const controller = createSpeechRecognizer(
        (transcript, isFinal) => {
          if (isFinal) {
            const clean = transcript.trim();
            if (clean.length >= 3) {
              appLogger.info('SPEECH_RECOGNITION', `Final transcript captured: "${clean}"`);
              handleVoiceCommand(clean);
            } else {
              appLogger.info('SPEECH_RECOGNITION', `Filtered short audio noise artifact: "${clean}"`);
            }
          }
        },
        (error) => {
          appLogger.error('SPEECH_RECOGNITION', `Speech recognition error: ${error}`);
          setIsListening(false);
          setVoiceStatus(`⚠️ ${error}`);
        },
        () => {
          setIsListening(false);
        }
      );

      if (!controller) return;
      recognizerRef.current = controller;
      controller.start();
      setIsListening(true);
      setVoiceStatus('🎙️ Live Audio Studio Active! Listening to your voice...');
    }
  };

  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const handleCopy = (msgId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handleReplayVoice = (text: string) => {
    appLogger.info('AUDIO', `Replaying studio voice (${studioVoice})`);
    stopAudioResponse();
    unlockAudioContext();
    speakNativeAudioResponse(
      '',
      text,
      apiKey,
      modelName || GEMINI_LIVE_MODELS[0].id,
      () => setIsSpeaking(true),
      () => setIsSpeaking(false),
      undefined,
      false,
      studioVoice
    );
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSettings(false);
        setShowHistory(false);
        setShowLogsDrawer(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      recognizerRef.current?.stop();
      vadRef.current?.stop();
      stopAudioResponse();
      AdkLiveAgent.releaseInstance();
      liveAgentRef.current = null;
    };
  }, []);

  return (
    <div className="app-container">
      {/* Top Header with Navigation Tabs & Audio Signal Indicator */}
      <AppHeader
        currentPath="/agentic"
        onNavigate={onNavigate}
        provider="gemini"
        setProvider={() => {}}
        isLoading={isLoading}
        isListening={isListening}
        isSpeaking={isSpeaking}
        isMuted={isMuted}
        onToggleMute={() => {
          if (!isMuted) stopAudioResponse();
          setIsMuted(!isMuted);
        }}
        onOpenHistory={handleOpenHistory}
        onOpenSettings={() => setShowSettings(true)}
        onExportPng={handleExportPng}
        onNewSession={handleNewSession}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        isCanvasFrozen={isCanvasFrozen}
        onToggleCanvasLock={() => setIsCanvasFrozen(!isCanvasFrozen)}
        modelName={modelName}
      />

      {/* Main Workspace (70% Excalidraw Canvas, 30% Voice Chat - Collapsible) */}
      <main className="main-workspace">
        <div className={`excalidraw-wrapper ${isChatCollapsed ? 'canvas-full-width' : ''}`}>
          {isChatCollapsed && (
            <button
              className="floating-chat-toggle-btn"
              onClick={() => setIsChatCollapsed(false)}
              title="Expand Agentic Chat Panel"
            >
              <span>💬 Agentic Chat</span>
              <span className="expand-arrow">◀</span>
            </button>
          )}

          {/* Top Canvas Toolbar: Freeze / Unfreeze + Live Logs Toggle */}
          <div style={{
            position: 'absolute',
            top: '12px',
            right: isChatCollapsed ? '170px' : '12px',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--bg-secondary)',
            padding: '6px 12px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            backdropFilter: 'blur(8px)',
            transition: 'right 0.3s ease'
          }}>
            <button
              onClick={() => setShowLogsDrawer(!showLogsDrawer)}
              style={{
                background: showLogsDrawer ? 'rgba(99, 102, 241, 0.25)' : 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                color: showLogsDrawer ? '#a5b4fc' : 'var(--text-primary)',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="Toggle Live System Logs & Diagnostics"
            >
              <span>📋 Live Logs</span>
              <span style={{
                background: '#4f46e5',
                color: 'white',
                fontSize: '10px',
                padding: '1px 5px',
                borderRadius: '10px'
              }}>
                {logs.length}
              </span>
            </button>

            <button
              onClick={() => setIsCanvasFrozen(!isCanvasFrozen)}
              style={{
                background: isCanvasFrozen ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                border: `1px solid ${isCanvasFrozen ? '#ef4444' : '#10b981'}`,
                color: isCanvasFrozen ? '#fca5a5' : '#6ee7b7',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {isCanvasFrozen ? '🔒 Frozen (AI Only)' : '🔓 Unlocked (Interactive)'}
            </button>
          </div>

          <Excalidraw
            excalidrawAPI={(api) => setExcalidrawAPI(api)}
            theme={theme}
            viewModeEnabled={isCanvasFrozen}
            zenModeEnabled={false}
            gridModeEnabled={false}
            UIOptions={{
              canvasActions: {
                changeViewBackgroundColor: true,
                clearCanvas: true,
                loadScene: true,
                toggleTheme: true
              }
            }}
          />

          {/* Expandable Live Diagnostics & Terminal Log Drawer on Canvas */}
          {showLogsDrawer && (
            <div style={{
              position: 'absolute',
              bottom: '12px',
              left: '12px',
              right: isChatCollapsed ? '12px' : '12px',
              height: '240px',
              background: '#090d16',
              border: '1px solid #334155',
              borderRadius: '10px',
              zIndex: 20,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              fontFamily: 'monospace',
              fontSize: '12px'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '6px 12px',
                background: '#111827',
                borderBottom: '1px solid #1f2937',
                borderTopLeftRadius: '10px',
                borderTopRightRadius: '10px'
              }}>
                <span style={{ color: '#38bdf8', fontWeight: 600 }}>🖥️ Standard Diagnostics & Terminal Log Stream</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => appLogger.clear()}
                    style={{ background: 'transparent', border: '1px solid #374151', color: '#9ca3af', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontSize: '11px' }}
                  >
                    Clear Logs
                  </button>
                  <button
                    onClick={() => setShowLogsDrawer(false)}
                    style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '14px' }}
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {logs.map((log) => (
                  <div key={log.id} style={{ display: 'flex', gap: '8px', lineHeight: '1.4' }}>
                    <span style={{ color: '#64748b' }}>[{log.timestamp}]</span>
                    <span style={{
                      fontWeight: 700,
                      color: log.level === 'ERROR' ? '#ef4444' : log.level === 'WARN' ? '#f59e0b' : log.level === 'TOOL' ? '#c084fc' : '#38bdf8'
                    }}>
                      [{log.tag}]
                    </span>
                    <span style={{ color: log.level === 'ERROR' ? '#fca5a5' : '#e2e8f0' }}>{log.message}</span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}
        </div>

        {/* 30% Audio Studio Master Console & Read-Only Transcript (Collapsible) */}
        <div className={`chat-container ${isChatCollapsed ? 'chat-collapsed' : ''}`}>
          <div className="chat-header">
            <div className="chat-header-title">
              <h2>🎙️ Live Audio Studio</h2>
              <span className={`session-id-pill ${isLiveAgentRunning ? 'active' : ''}`} style={{
                color: isLiveAgentRunning ? '#f87171' : '#94a3b8',
                borderColor: isLiveAgentRunning ? '#ef4444' : 'var(--border-color)'
              }}>
                {isLiveAgentRunning ? '🔴 ON AIR' : '⚪ STANDBY'}
              </span>
            </div>
            <button
              className="chat-collapse-btn"
              onClick={() => setIsChatCollapsed(true)}
              title="Collapse audio studio panel"
            >
              ▶
            </button>
          </div>

          {/* Master ON-AIR Broadcast Deck */}
          <div className="studio-on-air-deck">
            <button
              onClick={toggleLiveAgentSession}
              className={`studio-on-air-btn ${isLiveAgentRunning ? 'on-air' : 'standby'}`}
              title={isLiveAgentRunning ? 'Stop Live Audio Session' : 'Start Live Audio Studio'}
            >
              <span style={{ fontSize: '18px' }}>{isLiveAgentRunning ? '🛑' : '🎙️'}</span>
              <span>{isLiveAgentRunning ? 'ON AIR • Click to End' : 'Start Live Audio Studio'}</span>
            </button>

            {/* Real-time Dynamic Multi-Band Sound Visualizer & Status */}
            <div className={`voice-hero-banner ${isListening ? 'listening' : isSpeaking ? 'speaking' : ''}`} style={{ borderRadius: '10px', padding: '10px 14px' }}>
              <div className="voice-visualizer">
                <span className="wave-bar bar1" style={{ transform: audioLevel > 0 || isSpeaking ? `scaleY(${Math.max(0.35, (audioLevel || 0.5) * 1.8)})` : undefined }}></span>
                <span className="wave-bar bar2" style={{ transform: audioLevel > 0 || isSpeaking ? `scaleY(${Math.max(0.45, (audioLevel || 0.7) * 2.2)})` : undefined }}></span>
                <span className="wave-bar bar3" style={{ transform: audioLevel > 0 || isSpeaking ? `scaleY(${Math.max(0.65, (audioLevel || 0.9) * 2.8)})` : undefined }}></span>
                <span className="wave-bar bar4" style={{ transform: audioLevel > 0 || isSpeaking ? `scaleY(${Math.max(0.45, (audioLevel || 0.7) * 2.2)})` : undefined }}></span>
                <span className="wave-bar bar5" style={{ transform: audioLevel > 0 || isSpeaking ? `scaleY(${Math.max(0.35, (audioLevel || 0.5) * 1.8)})` : undefined }}></span>
              </div>
              <div className="voice-status-text" style={{ fontSize: '12px' }}>
                {activeSubagentEvent && activeSubagentEvent.status === 'running' ? (
                  <span style={{ color: '#818cf8', fontWeight: 600 }}>{activeSubagentEvent.message}</span>
                ) : isListening ? (
                  '🎙️ Mic Active • Listening...'
                ) : isSpeaking ? (
                  `🔊 Copilot Speaking (${studioVoice})...`
                ) : isLoading ? (
                  '⚡ Multi-Agent Synthesis...'
                ) : (
                  voiceStatus
                )}
              </div>
            </div>

            {/* VU Decibel Meter & Live VAD Indicator Rack */}
            <div className="studio-meter-rack">
              <div className="studio-vu-container">
                <div className="studio-vu-label">
                  <span>VU Level Meter</span>
                  <span>{audioLevel > 0.05 ? `${Math.round(audioLevel * 100)}%` : '0 dB'}</span>
                </div>
                <div className="studio-vu-led-strip">
                  <div className={`vu-segment ${(audioLevel > 0.04 || isSpeaking) ? 'lit-green' : ''}`} />
                  <div className={`vu-segment ${(audioLevel > 0.18 || isSpeaking) ? 'lit-green' : ''}`} />
                  <div className={`vu-segment ${(audioLevel > 0.35 || isSpeaking) ? 'lit-green' : ''}`} />
                  <div className={`vu-segment ${(audioLevel > 0.55 || (isSpeaking && Math.random() > 0.4)) ? 'lit-amber' : ''}`} />
                  <div className={`vu-segment ${(audioLevel > 0.72 || (isSpeaking && Math.random() > 0.7)) ? 'lit-amber' : ''}`} />
                  <div className={`vu-segment ${(audioLevel > 0.88) ? 'lit-red' : ''}`} />
                </div>
              </div>
              <div className={`studio-vad-badge ${isVadActive || isListening ? 'active' : ''}`}>
                <span className="studio-vad-dot" />
                <span>{isVadActive ? 'Voice Active' : isListening ? 'Mic Open' : 'Silent Floor'}</span>
              </div>
            </div>

            {/* Studio Quick Control Strip */}
            <div className="studio-quick-toolbar">
              <select
                value={studioVoice}
                onChange={(e) => setStudioVoice(e.target.value)}
                className="studio-voice-select"
                title="Select 24kHz Neural Audio Voice Persona"
              >
                {STUDIO_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className={`studio-auto-listen-btn ${autoListen ? 'active' : ''}`}
                onClick={() => setAutoListen(!autoListen)}
                title={autoListen ? 'Auto-Listen ON: Hands-free conversation' : 'Auto-Listen OFF: Single turn'}
              >
                {autoListen ? '🔄 Auto-Listen ON' : '⏸️ Single Turn'}
              </button>

              <button
                type="button"
                className={`voice-mute-btn ${isMuted ? 'muted' : ''}`}
                onClick={() => {
                  if (!isMuted) stopAudioResponse();
                  setIsMuted(!isMuted);
                }}
                title={isMuted ? 'Unmute Audio Response' : 'Mute Audio Response'}
              >
                {isMuted ? '🔇 Muted' : '🔊 Audio'}
              </button>
            </div>
          </div>

          {/* Read-Only Transcript Header */}
          <div className="studio-transcript-header">
            <span>📜 Live Session Transcript</span>
            <span className="read-only-pill">READ ONLY</span>
          </div>

          {/* Read-Only Messages & Audio Dialogue Feed */}
          <div className="chat-messages" style={{ flex: 1, overflowY: 'auto' }}>
            {messages.map((msg) => (
              <div key={msg.id} className={`message ${msg.sender}`}>
                <div className="message-bubble">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: msg.sender === 'assistant' ? '#818cf8' : '#38bdf8' }}>
                      {msg.sender === 'assistant' ? `🎙️ Studio Copilot (${studioVoice})` : '👤 Director (Voice)'}
                    </span>
                    {msg.subagentBadge && (
                      <span style={{
                        fontSize: '10.5px',
                        padding: '1px 6px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(99, 102, 241, 0.15)',
                        color: '#a5b4fc',
                        border: '1px solid rgba(99, 102, 241, 0.3)'
                      }}>
                        {msg.subagentBadge}
                      </span>
                    )}
                  </div>

                  <p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 8px 0', lineHeight: '1.5' }}>{msg.text}</p>

                  <div className="message-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                    <span className="message-timestamp">{msg.timestamp}</span>
                    {msg.sender === 'assistant' && msg.text && (
                      <div className="message-actions" style={{ display: 'flex', gap: '6px' }}>
                        <button
                          className="msg-action-btn"
                          onClick={() => handleCopy(msg.id, msg.text)}
                          title="Copy text breakdown"
                        >
                          {copiedMsgId === msg.id ? '✓ Copied' : '📋 Copy'}
                        </button>
                        <button
                          className="msg-action-btn"
                          onClick={() => handleReplayVoice(msg.text)}
                          title={`Replay voice explanation with ${studioVoice}`}
                        >
                          🔊 Replay Audio
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {msg.suggestions && msg.suggestions.length > 0 && (
                  <div className="suggestions-container">
                    <span className="suggestions-label">💡 Try saying or clicking:</span>
                    <div className="suggestions-list">
                      {msg.suggestions.map((sug, i) => (
                        <button
                          key={i}
                          className="suggestion-chip"
                          onClick={() => {
                            if (!isLiveAgentRunning) {
                              toggleLiveAgentSession();
                            }
                            handleVoiceCommand(sug);
                          }}
                        >
                          💬 {sug}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="message assistant loading">
                <div className="message-bubble">
                  <div className="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Orchestrating architectural breakdown & rendering canvas...
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Real-time Studio Footer Status (No manual typing clutter) */}
          <div className="studio-footer-status">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`status-dot ${isListening ? 'listening' : isSpeaking ? 'speaking' : isLoading ? 'loading' : ''}`} />
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {isListening
                  ? '🎙️ Studio Mic Listening... Speak hands-free'
                  : isSpeaking
                  ? `🔊 Copilot Speaking (${studioVoice})...`
                  : isLoading
                  ? '⚡ Multi-Agent Synthesis...'
                  : isLiveAgentRunning
                  ? '🎙️ Studio Live & Ready'
                  : '⚪ Studio on Standby. Click "Start Live Audio Studio" above.'}
              </span>
            </div>
            <button
              onClick={() => setShowLogsDrawer(!showLogsDrawer)}
              style={{
                background: showLogsDrawer ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                border: '1px solid var(--border-color)',
                color: showLogsDrawer ? '#38bdf8' : 'var(--text-secondary)',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              title="Toggle Live Diagnostics Stream"
            >
              🖥️ Logs
            </button>
          </div>
        </div>
      </main>

      {/* Unified History Modal */}
      <HistoryModal
        open={showHistory}
        onClose={() => setShowHistory(false)}
        sessionId={sessionId}
        historySummaries={historySummaries}
        onRestoreSession={handleRestoreSession}
        onExportSessionPdf={handleExportPdf}
        onRequestDeleteSession={handleDeleteSession}
      />

      {/* Unified Multi-Agent Settings Modal */}
      {showSettings && (
        <div className="popup-overlay" onClick={() => setShowSettings(false)}>
          <div className="popup-window" onClick={(e) => e.stopPropagation()}>
            <div className="popup-header">
              <h3>⚙️ Multi-Agent Architecture Settings</h3>
              <button className="popup-close-btn" onClick={() => setShowSettings(false)}>✕</button>
            </div>

            <div className="popup-body">
              {/* Provider Selection Cards */}
              <div className="provider-selector" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div
                  className={`provider-card ${settingsActiveCard === 'gemini' ? 'active' : ''}`}
                  onClick={() => setSettingsActiveCard('gemini')}
                >
                  <div className="provider-icon">✨</div>
                  <div className="provider-title">Gemini Live</div>
                  <div className="provider-subtitle">Voice & Orchestrator</div>
                </div>
                <div
                  className={`provider-card ${settingsActiveCard === 'groq' ? 'active' : ''}`}
                  onClick={() => setSettingsActiveCard('groq')}
                >
                  <div className="provider-icon">⚡</div>
                  <div className="provider-title">Groq LPU</div>
                  <div className="provider-subtitle">Text Subagent</div>
                </div>
                <div
                  className={`provider-card ${settingsActiveCard === 'mistral' ? 'active' : ''}`}
                  onClick={() => setSettingsActiveCard('mistral')}
                >
                  <div className="provider-icon">🦔</div>
                  <div className="provider-title">Mistral AI</div>
                  <div className="provider-subtitle">Diagram Subagent</div>
                </div>
              </div>

              {settingsActiveCard === 'gemini' && (
                <div className="setting-group">
                  <label>✨ Gemini API Key (Multimodal Voice Orchestrator)</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="AIzaSy..."
                  />
                  <div className="setting-hint">
                    Powers the Voice Live Agent & Native Audio. Get key at <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)' }}>Google AI Studio</a>.
                  </div>

                  <label style={{ marginTop: '12px' }}>Gemini Live Voice Model Preset</label>
                  <select
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    className="model-select"
                    style={{ marginBottom: '8px' }}
                  >
                    {GEMINI_LIVE_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder={GEMINI_LIVE_MODELS[0].id}
                  />
                  <div className="setting-hint">
                    Live API model for native voice audio orchestration.
                  </div>

                  <hr style={{ borderColor: 'var(--border-color)', margin: '16px 0' }} />

                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                    <span>🗣️ Guaranteed Speech Fallback</span>
                    <label style={{ position: 'relative', display: 'inline-block', width: '42px', height: '22px', flexShrink: 0 }}>
                      <input
                        type="checkbox"
                        checked={browserSpeechEnabled}
                        onChange={(e) => setBrowserSpeechEnabled(e.target.checked)}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span style={{
                        position: 'absolute', cursor: 'pointer', inset: 0,
                        backgroundColor: browserSpeechEnabled ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                        borderRadius: '22px', transition: 'background-color 0.2s',
                      }}>
                        <span style={{
                          position: 'absolute', height: '16px', width: '16px',
                          left: browserSpeechEnabled ? '22px' : '3px',
                          bottom: '3px', backgroundColor: 'white', borderRadius: '50%',
                          transition: 'left 0.2s'
                        }} />
                      </span>
                    </label>
                  </label>
                  <div className="setting-hint">
                    Ensures natural voice audio always speaks aloud even if Live API WebSocket is restricted.
                  </div>
                </div>
              )}

              {settingsActiveCard === 'groq' && (
                <div className="setting-group">
                  <label>⚡ Groq API Key (Text Subagent)</label>
                  <input
                    type="password"
                    value={groqApiKey}
                    onChange={(e) => setGroqApiKey(e.target.value)}
                    placeholder="gsk_..."
                  />
                  <div className="setting-hint">
                    Generates architectural text explanations at ~500 tok/sec (under 350ms). Free key at <a href="https://console.groq.com" target="_blank" rel="noreferrer" style={{ color: '#818cf8' }}>console.groq.com</a>.
                  </div>

                  <label style={{ marginTop: '12px' }}>Groq LPU Model Preset</label>
                  <select
                    value={groqModel}
                    onChange={(e) => setGroqModel(e.target.value)}
                    className="model-select"
                    style={{ marginBottom: '8px' }}
                  >
                    {GROQ_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={groqModel}
                    onChange={(e) => setGroqModel(e.target.value)}
                    placeholder="groq/compound"
                  />
                  <div className="setting-hint">
                    Ultra-fast LPU model used exclusively for architectural text breakdown.
                  </div>
                </div>
              )}

              {settingsActiveCard === 'mistral' && (
                <div className="setting-group">
                  <label>🦔 Mistral API Key (Diagram Subagent)</label>
                  <input
                    type="password"
                    value={mistralApiKey}
                    onChange={(e) => setMistralApiKey(e.target.value)}
                    placeholder="Mistral API Key..."
                  />
                  <div className="setting-hint">
                    Specialized in spatial coordinates and Excalidraw vector elements. Key at <a href="https://console.mistral.ai" target="_blank" rel="noreferrer" style={{ color: '#f59e0b' }}>console.mistral.ai</a>.
                  </div>

                  <label style={{ marginTop: '12px' }}>Mistral AI Model Preset</label>
                  <select
                    value={mistralModel}
                    onChange={(e) => setMistralModel(e.target.value)}
                    className="model-select"
                    style={{ marginBottom: '8px' }}
                  >
                    {MISTRAL_MODELS.map((m: { id: string; label: string }) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={mistralModel}
                    onChange={(e) => setMistralModel(e.target.value)}
                    placeholder="mistral-small-latest"
                  />
                  <div className="setting-hint">
                    Specialist model used exclusively for vector node & connector synthesis.
                  </div>
                </div>
              )}
            </div>

            <div className="popup-footer">
              <button
                className="popup-done-btn"
                onClick={() => setShowSettings(false)}
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
