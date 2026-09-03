import { useState, useEffect, useRef, useCallback } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import '../App.css';
import { generateDiagramFromPrompt, generateDiagramWithOllama } from '../services/aiService';
import { saveSessionTurn, getSessionTurns, getAllSessionsSummary, deleteSessionTurns } from '../services/sessionDbService';
import type { SessionSummary, SessionTurnRecord } from '../services/sessionDbService';
import { exportSessionToPdf } from '../services/pdfExportService';
import { useAuth } from '../context/AuthContext';
import { saveCloudSessionTurn, getCloudSessionsSummary, getCloudSessionTurns, deleteCloudSession } from '../services/supabaseDbService';
import { AppHeader } from './AppHeader';
import { registerActiveCanvasBridge } from '../services/webMcpService';
import { getItemEncrypted, setItemEncrypted, removeItem } from '../utils/cryptoStorage';
import {
  createSpeechRecognizer,
  speakNativeAudioResponse,
  fallbackSpeechSynthesis,
  stopAudioResponse,
  closePersistentLiveSession,
  unlockAudioContext,
  isSpeechRecognitionSupported,
  GEMINI_LIVE_MODELS,
  SUPPORTED_MODEL_IDS,
  type SpeechRecognitionController
} from '../services/voiceService';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  suggestions?: string[];
  isVoiceReply?: boolean;
}

interface VoiceWorkspaceProps {
  onNavigate: (path: string) => void;
}

export function VoiceWorkspace({ onNavigate }: VoiceWorkspaceProps) {
  const { user } = useAuth();
  const [input, setInput] = useState('');
  const [excalidrawAPI, setExcalidrawAPI] = useState<unknown>(null);

  // Active Session state
  const [sessionId, setSessionId] = useState<string>(
    () => `voice_sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
  );
  const [showHistory, setShowHistory] = useState(false);
  const [historySummaries, setHistorySummaries] = useState<SessionSummary[]>([]);

  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('APP_THEME') as 'dark' | 'light') || 'dark'
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('APP_THEME', theme);
  }, [theme]);

  const [provider, setProvider] = useState<'ollama' | 'gemini'>(
    () => (sessionStorage.getItem('AI_PROVIDER') as 'ollama' | 'gemini') || 
          (localStorage.getItem('AI_PROVIDER') as 'ollama' | 'gemini') || 
          'ollama'
  );
  const [ollamaEndpoint, setOllamaEndpoint] = useState(
    () => sessionStorage.getItem('OLLAMA_ENDPOINT') || 'https://ollama.com'
  );
  const [ollamaModel, setOllamaModel] = useState(
    () => sessionStorage.getItem('OLLAMA_MODEL') || 'gemma4:31b-cloud'
  );
  const [ollamaApiKey, setOllamaApiKey] = useState(() => {
    const raw = sessionStorage.getItem('OLLAMA_API_KEY') || '';
    return raw.startsWith('__ENC__:v1:') ? '' : raw;
  });
  const [apiKey, setApiKey] = useState(() => {
    const raw = sessionStorage.getItem('GEMINI_API_KEY') || '';
    return raw.startsWith('__ENC__:v1:') ? '' : raw;
  });
  const [modelName, setModelName] = useState<string>(() => {
    const saved = sessionStorage.getItem('GEMINI_MODEL');
    if (saved && (SUPPORTED_MODEL_IDS as readonly string[]).includes(saved)) {
      return saved;
    }
    sessionStorage.setItem('GEMINI_MODEL', SUPPORTED_MODEL_IDS[0]);
    return SUPPORTED_MODEL_IDS[0];
  });
  const [browserSpeechEnabled, setBrowserSpeechEnabled] = useState(
    () => sessionStorage.getItem('BROWSER_SPEECH_FALLBACK') === 'true'
  );
  const [showSettings, setShowSettings] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showOllamaKey, setShowOllamaKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCanvasFrozen, setIsCanvasFrozen] = useState(true);

  // Voice-specific states
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string>('Ready for voice prompt');
  const [rawLibraryItems, setRawLibraryItems] = useState<unknown[]>([]);

  const recognizerRef = useRef<SpeechRecognitionController | null>(null);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      sender: 'assistant',
      text: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestions: [
        'Design a high-scale Voice Stream Pipeline',
        'Draw Realtime Chat System Architecture',
        'Draw Serverless Microservices Flow'
      ]
    }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Asynchronously hydrate encrypted keys from localStorage (AES-GCM-256) on initial load
  useEffect(() => {
    let mounted = true;
    async function hydrateEncryptedKeys() {
      try {
        const [decryptedGemini, decryptedOllama] = await Promise.all([
          getItemEncrypted('GEMINI_API_KEY'),
          getItemEncrypted('OLLAMA_API_KEY')
        ]);
        if (!mounted) return;
        if (decryptedGemini) {
          setApiKey(decryptedGemini);
        }
        if (decryptedOllama) {
          setOllamaApiKey(decryptedOllama);
        }
      } catch (err) {
        console.warn('[VoiceWorkspace] Failed to hydrate encrypted keys:', err);
      }
    }
    hydrateEncryptedKeys();
    return () => { mounted = false; };
  }, []);

  // Clean up persistent Live API WebSocket session on component unmount
  useEffect(() => {
    return () => {
      stopAudioResponse();
      closePersistentLiveSession();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    sessionStorage.setItem('AI_PROVIDER', provider);
    localStorage.setItem('AI_PROVIDER', provider);
  }, [provider]);

  useEffect(() => {
    sessionStorage.setItem('OLLAMA_ENDPOINT', ollamaEndpoint);
    localStorage.setItem('OLLAMA_ENDPOINT', ollamaEndpoint);
  }, [ollamaEndpoint]);

  useEffect(() => {
    sessionStorage.setItem('OLLAMA_MODEL', ollamaModel);
    localStorage.setItem('OLLAMA_MODEL', ollamaModel);
  }, [ollamaModel]);

  useEffect(() => {
    if (ollamaApiKey) {
      sessionStorage.setItem('OLLAMA_API_KEY', ollamaApiKey);
      setItemEncrypted('OLLAMA_API_KEY', ollamaApiKey).catch(() => {});
    } else {
      sessionStorage.removeItem('OLLAMA_API_KEY');
      removeItem('OLLAMA_API_KEY');
    }
  }, [ollamaApiKey]);

  useEffect(() => {
    if (apiKey) {
      sessionStorage.setItem('GEMINI_API_KEY', apiKey);
      setItemEncrypted('GEMINI_API_KEY', apiKey).catch(() => {});
    } else {
      sessionStorage.removeItem('GEMINI_API_KEY');
      removeItem('GEMINI_API_KEY');
    }
  }, [apiKey]);

  useEffect(() => {
    sessionStorage.setItem('GEMINI_MODEL', modelName);
    localStorage.setItem('GEMINI_MODEL', modelName);
  }, [modelName]);

  useEffect(() => {
    sessionStorage.setItem('BROWSER_SPEECH_FALLBACK', String(browserSpeechEnabled));
  }, [browserSpeechEnabled]);

  useEffect(() => {
    fetch('/my-custom-library.excalidrawlib')
      .then((res) => res.json())
      .then((data) => {
        if (data.libraryItems) {
          setRawLibraryItems(data.libraryItems);
          if (excalidrawAPI) {
            (excalidrawAPI as { updateLibrary: (opt: unknown) => void }).updateLibrary({
              libraryItems: data.libraryItems,
              merge: true
            });
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load default library:', err);
      });
  }, [excalidrawAPI]);

  // Main diagram & text generation subagent executor
  const executeDiagramGeneration = async (promptQuery: string): Promise<{ chatReply: string; elements: any[] }> => {
    let result: { chatReply: string; elements: any[] };
    if (provider === 'ollama') {
      result = await generateDiagramWithOllama(`explain with diagram, ${promptQuery}`, ollamaEndpoint, ollamaModel, ollamaApiKey, rawLibraryItems);
    } else {
      result = await generateDiagramFromPrompt(`explain with diagram, ${promptQuery}`, apiKey, modelName || 'gemini-2.5-flash', rawLibraryItems);
    }

    if (excalidrawAPI) {
      (excalidrawAPI as { updateScene: (opt: unknown) => void }).updateScene({
        elements: result.elements,
        appState: { selectedElementIds: {} },
        commitToHistory: true,
        scrollToContent: true
      });
    }

    // Capture snapshot & record turn
    let snapshotDataUrl = '';
    try {
      const base64 = await getCanvasSnapshotBase64();
      if (base64) {
        snapshotDataUrl = `data:image/png;base64,${base64}`;
      }
    } catch (e) {}

    const turnId = `turn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const record: SessionTurnRecord = {
      session_id: sessionId,
      turn_id: turnId,
      user_prompt: promptQuery,
      chat_reply: result.chatReply,
      image_blob: snapshotDataUrl,
      created_at: new Date().toISOString()
    };

    await saveSessionTurn(record).catch((e) => console.warn('Failed to save local turn:', e));
    if (user) {
      await saveCloudSessionTurn(user.id, record).catch((e) => console.error('Failed to save cloud turn:', e));
    }

    const aiReply: Message = {
      id: (Date.now() + 1).toString(),
      sender: 'assistant',
      text: result.chatReply,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isVoiceReply: true
    };
    setMessages((prev) => [...prev, aiReply]);

    return result;
  };

  // Register active canvas bridge with WebMCP service
  useEffect(() => {
    if (!excalidrawAPI) return;
    const api = excalidrawAPI as {
      getSceneElements: () => any[];
      updateScene: (opts: any) => void;
    };

    const unregister = registerActiveCanvasBridge({
      getElements: () => api.getSceneElements() || [],
      setElements: (elements: any[]) => {
        api.updateScene({
          elements,
          commitToHistory: true,
          scrollToContent: true
        });
      },
      generateDiagram: async (promptText: string) => {
        return await executeDiagramGeneration(promptText);
      },
      getSnapshotBase64: async () => {
        return await getCanvasSnapshotBase64();
      },
      getChatMessages: () => {
        return messages.map((m) => ({
          role: m.sender,
          content: m.text
        }));
      }
    });

    return () => unregister();
  }, [excalidrawAPI, messages, provider, ollamaEndpoint, ollamaModel, ollamaApiKey, apiKey, modelName, rawLibraryItems, sessionId, user]);

  const getCanvasSnapshotBase64 = async (): Promise<string | null> => {
    if (!excalidrawAPI) return null;
    const api = excalidrawAPI as { getSceneElements: () => unknown[]; getAppState: () => unknown; getFiles: () => unknown };
    const elements = api.getSceneElements();
    if (!elements || elements.length === 0) return null;
    const appState = api.getAppState();
    const files = api.getFiles();

    try {
      const { exportToCanvas } = await import('@excalidraw/excalidraw');
      const canvas = await exportToCanvas({
        elements: elements as Parameters<typeof exportToCanvas>[0]['elements'],
        appState: { ...(appState as object), exportBackground: true, exportWithDarkMode: theme === 'dark' },
        files: files as Parameters<typeof exportToCanvas>[0]['files']
      });

      const dataUrl = canvas.toDataURL('image/png');
      return dataUrl.replace(/^data:image\/png;base64,/, '');
    } catch (e) {
      console.warn('Snapshot generation warning:', e);
      return null;
    }
  };

  const handleNewSession = () => {
    stopAudioResponse();
    closePersistentLiveSession();
    const newSid = `voice_sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setSessionId(newSid);
    setMessages([
      {
        id: Date.now().toString(),
        sender: 'assistant',
        text: '',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestions: [
          'Design a high-scale Voice Stream Pipeline',
          'Draw Realtime Chat System Architecture',
          'Draw Serverless Microservices Flow'
        ]
      }
    ]);

    if (excalidrawAPI) {
      (excalidrawAPI as { resetScene: () => void }).resetScene();
    }
  };

  const handleOpenHistory = async () => {
    setShowHistory(true);
    try {
      // 1. Prioritize local IndexedDB summaries first
      const localSummaries = await getAllSessionsSummary();
      if (localSummaries.length > 0 || !user) {
        setHistorySummaries(localSummaries);
      } else {
        // 2. Fallback to Supabase Cloud if local is empty and user is logged in
        const cloudSummaries = await getCloudSessionsSummary(user.id);
        setHistorySummaries(cloudSummaries);
      }
    } catch (e) {
      console.warn('History retrieval error, falling back to local history:', e);
      const localSummaries = await getAllSessionsSummary().catch(() => []);
      setHistorySummaries(localSummaries);
    }
  };

  const handleExportSessionPdf = async (targetSessionId: string) => {
    try {
      console.log(`[PDF] 📄 Generating Voice PDF for session=${targetSessionId}. Checking IndexedDB first...`);
      // 1. Check local IndexedDB first
      let turns: SessionTurnRecord[] = await getSessionTurns(targetSessionId);

      // 2. Fallback to Supabase Cloud if IndexedDB has no turns
      if (turns.length === 0 && user) {
        console.log(`[PDF] ☁️ IndexedDB empty for session=${targetSessionId}. Falling back to Supabase Cloud...`);
        turns = await getCloudSessionTurns(user.id, targetSessionId).catch(() => []);
      }

      if (turns.length === 0) {
        throw new Error('No turns found for this session to export.');
      }

      console.log(`[PDF] 🚀 Exporting PDF with ${turns.length} turns for session=${targetSessionId}`);
      await exportSessionToPdf(targetSessionId, turns);
    } catch (e: unknown) {
      const err = e as Error;
      alert(`PDF Export failed: ${err?.message || 'Unknown error'}`);
    }
  };

  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  const confirmDeleteSession = async (targetSessionId: string) => {
    try {
      await deleteSessionTurns(targetSessionId);
      if (user) {
        await deleteCloudSession(user.id, targetSessionId).catch(() => {});
      }
      const updatedSummaries = await getAllSessionsSummary().catch(() => []);
      setHistorySummaries(updatedSummaries);
    } catch (e) {
      console.error('Failed to delete session:', e);
    }
  };

  const handleRestoreSession = async (targetSessionId: string) => {
    try {
      // 1. Check local IndexedDB first
      let turns: SessionTurnRecord[] = await getSessionTurns(targetSessionId);

      // 2. Fallback to Supabase Cloud if IndexedDB has no turns
      if (turns.length === 0 && user) {
        turns = await getCloudSessionTurns(user.id, targetSessionId).catch(() => []);
      }

      if (turns.length === 0) return;

      setSessionId(targetSessionId);
      setShowHistory(false);

      const restoredMessages: Message[] = [];
      turns.forEach((turn) => {
        restoredMessages.push({
          id: `user_${turn.turn_id}`,
          sender: 'user',
          text: turn.user_prompt,
          timestamp: new Date(turn.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        restoredMessages.push({
          id: `ai_${turn.turn_id}`,
          sender: 'assistant',
          text: turn.chat_reply,
          timestamp: new Date(turn.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      });

      setMessages(restoredMessages);
    } catch (e) {
      console.error('Failed to restore session:', e);
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
      const { exportToBlob } = await import('@excalidraw/excalidraw');
      const blob = await exportToBlob({
        elements: elements as Parameters<typeof exportToBlob>[0]['elements'],
        appState: { ...(appState as object), exportBackground: true, exportWithDarkMode: theme === 'dark' },
        files: files as Parameters<typeof exportToBlob>[0]['files'],
        mimeType: 'image/png'
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `excalidraw-voice-diagram-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to export canvas image:', e);
    }
  };

  // Main submission handler: Runs normal model (diagram) + Native Audio model (speech response)
  const handleSend = async (textToSend?: string) => {
    const query = textToSend || input;
    if (!query.trim() || isLoading) return;

    unlockAudioContext();

    // Stop listening if user was speaking
    if (isListening && recognizerRef.current) {
      recognizerRef.current.stop();
      setIsListening(false);
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput('');

    if (provider === 'gemini' && !apiKey.trim()) {
      setTimeout(() => {
        const warningMsg: Message = {
          id: (Date.now() + 1).toString(),
          sender: 'assistant',
          text: '🔑 Please set your Gemini API Key in Settings (⚙️) panel to use Voice Canvas.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages((prev) => [...prev, warningMsg]);
      }, 300);
      setShowSettings(true);
      return;
    }

    setIsLoading(true);
    setVoiceStatus('⚡ Audio Agent processing...');

    // 🎙️ Primary Mode: Gemini Live Audio Agent Orchestrator
    // The Audio Specialist directly orchestrates diagram synthesis via its generate_diagram_and_explanation tool,
    // modifies components via modify_canvas_node, or answers conversationally!
    if (!isMuted && apiKey.trim()) {
      speakNativeAudioResponse(
        query,
        query || '', // Direct prompt mode for real-time Live API audio
        apiKey.trim(),
        modelName || SUPPORTED_MODEL_IDS[0],
        () => setIsSpeaking(true),
        () => {
          setIsSpeaking(false);
          setIsLoading(false);
          setVoiceStatus('Ready for voice prompt');
        },
        (err) => {
          console.warn('Voice error:', err);
          setIsSpeaking(false);
          setIsLoading(false);
          setVoiceStatus('Ready for voice prompt');
        },
        browserSpeechEnabled
      );
    } else {
      // 🎨 Fallback Mode: Direct Subagent Diagram Generation & Browser Speech Fallback
      try {
        const result = await executeDiagramGeneration(query);
        if (!isMuted && result.chatReply) {
          fallbackSpeechSynthesis(
            result.chatReply,
            () => {
              setIsSpeaking(false);
              setVoiceStatus('Ready for voice prompt');
            },
            (err) => {
              console.warn('Browser speech synthesis warning:', err);
              setIsSpeaking(false);
              setVoiceStatus('Ready for voice prompt');
            }
          );
        }
      } catch (error: unknown) {
        const err = error as Error;
        console.error('Diagram generation error:', err);
        const errorMsg: Message = {
          id: (Date.now() + 1).toString(),
          sender: 'assistant',
          text: `❌ Error: ${err?.message || 'Failed to generate diagram.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages((prev) => [...prev, errorMsg]);
        setVoiceStatus('Error generating response');
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Toggle voice recognition
  const toggleListening = useCallback(() => {
    if (isListening) {
      if (recognizerRef.current) {
        recognizerRef.current.stop();
      }
      setIsListening(false);
      setVoiceStatus('Voice input stopped');
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      alert('Web Speech Recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    stopAudioResponse();
    setIsSpeaking(false);

    const controller = createSpeechRecognizer(
      (text, isFinal) => {
        setInput(text);
        if (isFinal && text.trim()) {
          setVoiceStatus('Voice captured. Sending to models...');
        }
      },
      (err) => {
        console.warn('Speech recognition error:', err);
        setVoiceStatus(`Voice error: ${err}`);
        setIsListening(false);
      },
      () => {
        setIsListening(false);
        setVoiceStatus('Finished listening');
      }
    );

    if (controller) {
      recognizerRef.current = controller;
      controller.start();
      setIsListening(true);
      setVoiceStatus('🎙️ Listening... Speak your prompt');
    }
  }, [isListening]);

  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const handleCopy = (msgId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handleReplayVoice = (text: string) => {
    stopAudioResponse();
    const savedVoice = sessionStorage.getItem('STUDIO_VOICE') || 'Puck';
    speakNativeAudioResponse(
      '',
      text,
      apiKey,
      modelName || 'gemini-2.5-flash-native-audio-latest',
      () => setIsSpeaking(true),
      () => setIsSpeaking(false),
      undefined,
      false,
      savedVoice
    );
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSettings(false);
        setShowHistory(false);
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      stopAudioResponse();
    };
  }, []);

  return (
    <div className="app-container">
      {/* Page Header with Navigation Tabs & Audio Signal Indicator */}
      <AppHeader
        currentPath="/voice"
        onNavigate={onNavigate}
        provider={provider}
        setProvider={setProvider}
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
        ollamaModel={ollamaModel}
        modelName={modelName}
      />

      {/* Main Workspace (70% Excalidraw Canvas, 30% Voice Chat) */}
      <main className="main-workspace">
        <div className="excalidraw-wrapper">
          {/* Freeze / Unfreeze Lock Toggle */}
          <div style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--bg-secondary)',
            padding: '6px 12px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            backdropFilter: 'blur(8px)'
          }}>
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
        </div>

        {/* 30% Chat UI with Voice Controls */}
        <div className="chat-container">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>🎙️ Audio Visual Intel</h3>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }} title={sessionId}>ID: {sessionId.substring(0, 10)}...</span>
          </div>

          {/* Interactive Voice Hero Banner */}
          <div className={`voice-hero-banner ${isListening ? 'listening' : isSpeaking ? 'speaking' : ''}`}>
            <div className="voice-visualizer">
              <span className="wave-bar bar1"></span>
              <span className="wave-bar bar2"></span>
              <span className="wave-bar bar3"></span>
              <span className="wave-bar bar4"></span>
              <span className="wave-bar bar5"></span>
            </div>
            <div className="voice-status-text">
              {voiceStatus}
            </div>
          </div>

          {/* Chat Messages */}
          <div className="chat-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={`message ${msg.sender}`}>
                {msg.text && (
                  <div className="avatar">
                    {msg.sender === 'assistant' ? '🎙️' : '👤'}
                  </div>
                )}
                <div className="message-content" style={{ position: 'relative', width: '100%' }}>
                  {msg.text && (
                    <div className="message-bubble">
                      <button
                        className="copy-msg-btn"
                        onClick={() => handleCopy(msg.id, msg.text)}
                        title="Copy response"
                      >
                        {copiedMsgId === msg.id ? '✓ Copied' : 'Copy'}
                      </button>
                      {msg.sender === 'assistant' && (
                        <button
                          className="replay-voice-btn"
                          onClick={() => handleReplayVoice(msg.text)}
                          title="Replay Voice Answer"
                        >
                          🔊 Speak
                        </button>
                      )}
                      <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
                    </div>
                  )}

                  {msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="suggestions-container">
                      <div className="suggestions-title">Quick Voice Prompts:</div>
                      {msg.suggestions.map((suggestion, idx) => (
                        <button
                          key={idx}
                          className="suggestion-chip"
                          onClick={() => handleSend(suggestion)}
                          disabled={isLoading}
                        >
                          💬 {suggestion}
                        </button>
                      ))}
                    </div>
                  )}

                  {msg.text && <div className="timestamp">{msg.timestamp}</div>}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="message assistant">
                <div className="avatar">🎙️</div>
                <div className="message-bubble loading-bubble">
                  <div className="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Normal Model generating diagram & Native Audio processing...
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Voice Input & Chat Footer */}
          <div className="chat-footer">
            <div className="chat-input-wrapper">
              {/* Mic Toggle Button */}
              <button
                className={`mic-trigger-btn ${isListening ? 'active-listening' : ''}`}
                onClick={toggleListening}
                title={isListening ? 'Stop Voice Recording' : 'Start Voice Input'}
              >
                {isListening ? '🛑' : '🎙️'}
              </button>

              <textarea
                className="chat-input"
                placeholder={isListening ? 'Listening... Speak now' : 'Speak or type your diagram prompt...'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={3}
                disabled={isLoading}
              />
              <button
                className="send-btn"
                onClick={() => handleSend()}
                disabled={isLoading || !input.trim()}
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
              Tap 🎙️ to talk • Enter to send • Native Audio answering active
            </div>
          </div>
        </div>
      </main>

      {/* Settings Popup Window */}
      {showSettings && (
        <div className="popup-overlay" onClick={() => setShowSettings(false)}>
          <div className="popup-card settings-popup-card" onClick={(e) => e.stopPropagation()}>
            <div className="popup-header">
              <h3>⚙️ Visual Intelligence Settings</h3>
              <button className="popup-close-btn" onClick={() => setShowSettings(false)} aria-label="Close">✕</button>
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
                      const val = e.target.value;
                      if (val !== 'custom') {
                        setOllamaEndpoint(val);
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
                    <option value="gemma4:31b-cloud">gemma4:31b-cloud (Gemma 4 31B Cloud)</option>
                  </select>
                  <input
                    type="text"
                    value={ollamaModel}
                    onChange={(e) => setOllamaModel(e.target.value)}
                    placeholder="Or enter custom model name..."
                  />

                  <hr style={{ borderColor: 'var(--border-color)', margin: '16px 0' }} />
                  <label>✨ Gemini API Key (Required for Gemini Native Audio)</label>
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
                    Native Audio output is powered strictly by Gemini <code>gemini-2.5-flash-native-audio-latest</code>.
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

                  <label style={{ marginTop: '12px' }}>Gemini Model (Native Audio Engine)</label>
                  <select
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    className="model-select"
                    style={{ marginBottom: '8px' }}
                  >
                    {GEMINI_LIVE_MODELS.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder={SUPPORTED_MODEL_IDS[0]}
                  />
                  <div className="setting-hint">
                    Live API model for native voice audio.
                  </div>

                  <hr style={{ borderColor: 'var(--border-color)', margin: '16px 0' }} />
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                    <span>🗣️ Browser Speech Fallback</span>
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
                    If ON, browser TTS fires when all Gemini audio paths fail. May sound robotic.
                  </div>
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
          <div className="popup-card history-popup" onClick={(e) => e.stopPropagation()}>
            <div className="popup-header">
              <h3>📁 Saved Diagram History ({user ? 'Cloud Synced' : 'Local Storage'})</h3>
              <button className="popup-close-btn" onClick={() => setShowHistory(false)} aria-label="Close">✕</button>
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
                        <div className="history-title">{summary.first_prompt || 'Untitled Session'}</div>
                        <div className="history-meta">
                          <span>🔄 {summary.turn_count} {summary.turn_count === 1 ? 'turn' : 'turns'}</span>
                          <span>•</span>
                          <span>🕒 {new Date(summary.latest_created_at || summary.created_at).toLocaleString()}</span>
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
          <div className="popup-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px', textAlign: 'center' }}>
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
    </div>
  );
}
