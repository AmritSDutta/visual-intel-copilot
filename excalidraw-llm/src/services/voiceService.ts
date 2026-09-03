import { GoogleGenAI, Modality, Type } from '@google/genai';
import { StreamingAudioPlayer } from '../aiServices/audioUtils';
import { webMcpTools } from './webMcpService';
import {
  VOICE_LIVE_MODEL_OPTIONS,
  TASK_MODEL_REGISTRY
} from '../config/aiModelsConfig';

export const SUPPORTED_MODEL_IDS = [
  TASK_MODEL_REGISTRY.VOICE_LIVE_AGENT.primaryModel,
  ...TASK_MODEL_REGISTRY.VOICE_LIVE_AGENT.fallbackModels
] as const;

export type SupportedLiveModelId = (typeof SUPPORTED_MODEL_IDS)[number];

export const GEMINI_LIVE_MODELS = VOICE_LIVE_MODEL_OPTIONS;

export interface StudioVoiceOption {
  id: string;
  name: string;
}

export const STUDIO_VOICES: StudioVoiceOption[] = [
  { id: 'Puck', name: '🎙️ Puck (Clear & Energetic)' },
  { id: 'Charon', name: '🎙️ Charon (Deep & Resonant)' },
  { id: 'Kore', name: '🎙️ Kore (Warm & Natural)' },
  { id: 'Fenrir', name: '🎙️ Fenrir (Authoritative & Strong)' },
  { id: 'Aoede', name: '🎙️ Aoede (Melodic & Bright)' }
];


declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (event: { resultIndex: number; results: Array<Array<{ transcript: string }> & { isFinal?: boolean }> }) => void;
  onerror: (event: { error?: string }) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export interface VoiceState {
  isListening: boolean;
  isSpeaking: boolean;
  transcript: string;
  audioLevel: number;
}

export interface SpeechRecognitionController {
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export function isSpeechRecognitionSupported(): boolean {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function createSpeechRecognizer(
  onResult: (transcript: string, isFinal: boolean) => void,
  onError: (error: string) => void,
  onEnd: () => void
): SpeechRecognitionController | null {
  if (!isSpeechRecognitionSupported()) {
    onError('Web Speech Recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
    return null;
  }

  const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognitionClass();

  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const result = event.results[i];
      if (result.isFinal) {
        finalTranscript += result[0].transcript;
      } else {
        interimTranscript += result[0].transcript;
      }
    }

    const text = finalTranscript || interimTranscript;
    const isFinal = !!finalTranscript;
    onResult(text, isFinal);
  };

  recognition.onerror = (event) => {
    console.warn('Speech Recognition error:', event.error);
    onError(event.error || 'Speech recognition error');
  };

  recognition.onend = () => {
    onEnd();
  };

  return {
    start: () => {
      try {
        recognition.start();
      } catch (err) {
        console.warn('Recognition start exception:', err);
      }
    },
    stop: () => {
      try {
        recognition.stop();
      } catch {
        // Ignore stop errors
      }
    },
    abort: () => {
      try {
        recognition.abort();
      } catch {
        // Ignore abort errors
      }
    }
  };
}

let activeSpeechUtterance: SpeechSynthesisUtterance | null = null;
let activeAudioElement: HTMLAudioElement | null = null;

export function getActiveSpeechUtterance(): SpeechSynthesisUtterance | null {
  return activeSpeechUtterance;
}

let globalAudioCtx: AudioContext | null = null;

export function unlockAudioContext(): void {
  if (typeof window === 'undefined') return;

  try {
    if (window.speechSynthesis) {
      window.speechSynthesis.resume();
    }
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!globalAudioCtx || globalAudioCtx.state === 'closed') {
      globalAudioCtx = new AudioCtx();
    }
    if (globalAudioCtx.state === 'suspended') {
      globalAudioCtx.resume();
    }
    const buffer = globalAudioCtx.createBuffer(1, 1, 22050);
    const source = globalAudioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(globalAudioCtx.destination);
    source.start(0);
  } catch (e) {
    console.warn('Audio context unlock warning:', e);
  }
}

let activeAudioSourceNode: AudioBufferSourceNode | null = null;
let activeAudioContext: AudioContext | null = null;

export function stopAudioResponse(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
  if (activeLiveSession?.player) {
    try {
      activeLiveSession.player.stop();
    } catch {}
  }
  if (activeAudioElement) {
    try {
      activeAudioElement.pause();
      activeAudioElement.src = '';
    } catch {}
    activeAudioElement = null;
  }
  if (activeAudioSourceNode) {
    try {
      activeAudioSourceNode.stop();
      activeAudioSourceNode.disconnect();
    } catch {}
    activeAudioSourceNode = null;
  }
  if (activeAudioContext && activeAudioContext.state !== 'closed') {
    try {
      activeAudioContext.close();
    } catch {}
    activeAudioContext = null;
  }
  activeSpeechUtterance = null;
}

interface ActiveLiveSessionState {
  session: any;
  apiKey: string;
  model: string;
  voiceName: string;
  player: StreamingAudioPlayer;
  isOpen: boolean;
  onEnd?: () => void;
}

let activeLiveSession: ActiveLiveSessionState | null = null;

export function isLiveSessionConnected(): boolean {
  return !!(activeLiveSession && activeLiveSession.isOpen && activeLiveSession.session);
}

export function closePersistentLiveSession(): void {
  if (activeLiveSession) {
    console.log('[Native Audio] Closing persistent Live API session...');
    try {
      activeLiveSession.player.stop();
      activeLiveSession.player.close();
    } catch {}
    try {
      activeLiveSession.session?.close?.();
    } catch {}
    activeLiveSession = null;
  }
}

/**
 * Sends a message to a persistent Gemini Live API WebSocket session.
 * Reconnects lazily only if disconnected or if credentials/model changed.
 * Avoids opening multiple concurrent WebSockets and prevents multiple voice agents from talking simultaneously.
 */
async function speakWithLiveApi(
  text: string,
  apiKey: string,
  liveModel: string,
  onEnd?: () => void,
  voiceName: string = 'Puck'
): Promise<boolean> {
  try {
    // 1. If an active session is already connected with matching settings, reuse it immediately
    if (
      activeLiveSession &&
      activeLiveSession.isOpen &&
      activeLiveSession.session &&
      activeLiveSession.apiKey === apiKey &&
      activeLiveSession.model === liveModel &&
      activeLiveSession.voiceName === voiceName
    ) {
      console.log(`[Native Audio] Reusing active Live API session for model ${liveModel}`);
      // Stop previous audio if still playing to prevent overlapping speech
      activeLiveSession.player.stop();
      activeLiveSession.onEnd = onEnd;

      activeLiveSession.session.sendClientContent({
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true
      });
      return true;
    }

    // 2. Close stale session if settings changed or previously disconnected
    if (activeLiveSession) {
      closePersistentLiveSession();
    }

    // 3. Establish persistent connection
    console.log(`[Native Audio] Establishing persistent Live API session → ${liveModel} (${voiceName})`);
    const ai = new GoogleGenAI({ apiKey, apiVersion: 'v1alpha' });

    const player = new StreamingAudioPlayer(24000, () => {
      activeLiveSession?.onEnd?.();
    });

    const functionDeclarations = webMcpTools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: {
        type: Type.OBJECT,
        properties: (t.inputSchema.properties || {}) as any,
        required: (t.inputSchema.required as string[]) || []
      }
    }));

    const connected = await new Promise<boolean>((resolve, reject) => {
      let isResolved = false;

      ai.live.connect({
        model: liveModel,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } }
          },
          systemInstruction: {
            parts: [{
              text: `You are Inquisitive Voice Assistant, a friendly and intelligent visual architecture co-pilot.
You have real-time WebMCP tools to inspect, generate, and manipulate the live Excalidraw canvas whiteboard while speaking:
1. When the user asks to draw, design, or generate a system architecture or visual diagram, call the 'generate_diagram_and_explanation' tool with their requirements.
2. When the user asks about what is currently on the whiteboard, call 'inspect_canvas_topology' or 'find_canvas_nodes' to inspect the actual components.
3. When the user asks for in-place modifications (renaming a box, changing colors, repositioning), call 'modify_canvas_node'.
4. When the user asks to add extra shapes or connectors, call 'append_canvas_elements'.
5. When the user asks general technical or conceptual questions, answer conversationally in natural, engaging speech without generating diagrams unless requested.
Always acknowledge tool actions smoothly and provide a clear, concise verbal summary of what was drawn or modified.`
            }]
          },
          tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined
        },
        callbacks: {
          onopen: () => {
            console.log(`[Native Audio] Live API WebSocket opened with ${webMcpTools.length} WebMCP tools for model ${liveModel}`);
          },
          onmessage: async (msg: unknown) => {
            const m = msg as {
              toolCall?: {
                functionCalls?: Array<{
                  id?: string;
                  name: string;
                  args?: Record<string, any>;
                }>;
              };
              serverContent?: {
                modelTurn?: { parts?: Array<{ inlineData?: { data?: string } }> };
                turnComplete?: boolean;
              };
            };

            // 🛠️ Handle Live Tool Calls from the Audio Specialist
            if (m.toolCall?.functionCalls && m.toolCall.functionCalls.length > 0) {
              console.log('[Native Audio] Voice Agent called WebMCP tools:', m.toolCall.functionCalls);
              const responses = [];
              for (const call of m.toolCall.functionCalls) {
                const tool = webMcpTools.find((t) => t.name === call.name);
                let toolResult: any = { error: `Tool "${call.name}" not found` };
                if (tool) {
                  try {
                    toolResult = await tool.execute(call.args || {});
                  } catch (err: any) {
                    toolResult = { error: String(err?.message || err) };
                  }
                }
                responses.push({
                  id: call.id || call.name,
                  name: call.name,
                  response: toolResult
                });
              }

              if (activeLiveSession?.session) {
                try {
                  activeLiveSession.session.sendToolResponse({
                    functionResponses: responses
                  });
                } catch (toolErr) {
                  console.warn('[Native Audio] Failed to send tool response:', toolErr);
                }
              }
            }

            for (const part of m.serverContent?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                player.feed(part.inlineData.data);
              }
            }
            if (m.serverContent?.turnComplete) {
              player.signalGenerationComplete();
            }
          },
          onerror: (e: unknown) => {
            console.warn(`[Native Audio] Live API error on ${liveModel}:`, e);
            if (activeLiveSession) {
              activeLiveSession.isOpen = false;
              activeLiveSession.session = null;
            }
            if (!isResolved) {
              isResolved = true;
              reject(e);
            }
          },
          onclose: (e?: any) => {
            const code = e?.code ?? 'unknown';
            const reason = e?.reason || 'No reason provided';
            console.log(`[Native Audio] Live API WebSocket closed for model ${liveModel} [code: ${code}, reason: "${reason}"]`);
            if (activeLiveSession) {
              activeLiveSession.isOpen = false;
              activeLiveSession.session = null;
            }
            player.signalGenerationComplete();
          }
        }
      }).then((session) => {
        activeLiveSession = {
          session,
          apiKey,
          model: liveModel,
          voiceName,
          player,
          isOpen: true,
          onEnd
        };
        session.sendClientContent({
          turns: [{ role: 'user', parts: [{ text }] }],
          turnComplete: true
        });
        if (!isResolved) {
          isResolved = true;
          resolve(true);
        }
      }).catch((e) => {
        player.close();
        if (activeLiveSession) {
          activeLiveSession.isOpen = false;
          activeLiveSession.session = null;
        }
        if (!isResolved) {
          isResolved = true;
          reject(e);
        }
      });
    });

    return connected;
  } catch (e) {
    console.warn(`[Native Audio] Live API ${liveModel} connection failed:`, e);
    return false;
  }
}

/**
 * Generate native audio response using Gemini Live API.
 * Primary:  gemini-2.5-flash-native-audio-preview-12-2025
 * Fallback: gemini-3.1-flash-live-preview
 * Last resort: browser SpeechSynthesis (only if browserSpeechEnabled = true)
 */
export async function speakNativeAudioResponse(
  prompt: string,
  chatReply?: string,
  apiKey?: string,
  _modelName: string = SUPPORTED_MODEL_IDS[0],
  onStart?: () => void,
  onEnd?: () => void,
  onError?: (err: string) => void,
  browserSpeechEnabled = false,
  voiceName: string = 'Puck'
): Promise<void> {
  stopAudioResponse();
  unlockAudioContext();
  onStart?.();

  const textToSpeak = chatReply ? chatReply.trim() : '';
  const spokenInstruction = textToSpeak
    ? `You are a voice teaching assistant. Speak the following reply aloud in 10 to 15 natural, engaging sentences about : ${textToSpeak}`
    : prompt;

  if (!apiKey || !apiKey.trim()) {
    console.warn('[Native Audio] No Gemini API key — skipping Live API.');
    if (browserSpeechEnabled && textToSpeak) {
      fallbackSpeechSynthesis(textToSpeak, onEnd, onError);
    } else {
      console.log('[Native Audio] Browser speech disabled in settings or no chat text. Silent.');
      onEnd?.();
    }
    return;
  }

  // 🥇 PRIMARY + 🥈 FALLBACK: Live API model chain
  const liveModels = GEMINI_LIVE_MODELS.map((m) => m.id);

  for (const liveModel of liveModels) {
    const played = await speakWithLiveApi(spokenInstruction, apiKey.trim(), liveModel, onEnd, voiceName);
    if (played) return;
  }

  // 🥉 LAST RESORT: Browser speech (only if enabled in settings and chat text exists)
  if (browserSpeechEnabled && textToSpeak) {
    console.log('[Native Audio] All Gemini Live paths failed — using browser speech synthesis.');
    fallbackSpeechSynthesis(textToSpeak, onEnd, onError);
  } else {
    console.log('[Native Audio] All Gemini Live paths failed. Silent.');
    onEnd?.();
  }
}

export function fallbackSpeechSynthesis(
  text: string,
  onEnd?: () => void,
  onError?: (err: string) => void
): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    onError?.('Web Speech Synthesis is not supported in this browser.');
    onEnd?.();
    return;
  }

  stopAudioResponse();
  unlockAudioContext();

  const cleanSpokenText = text
    .replace(/[#*`_]/g, '')
    .replace(/SYSTEM ARCHITECTURE BREAKDOWN/gi, '')
    .replace(/COMPONENTS OVERVIEW/gi, 'Components overview')
    .replace(/DATA FLOW & SEQUENCE/gi, 'Data flow sequence')
    .trim();

  // Split full response into sentence chunks for continuous, un-interrupted speech in Chrome
  const sentences = cleanSpokenText
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length === 0) {
    onEnd?.();
    return;
  }

  let currentIndex = 0;
  let keepAliveInterval: NodeJS.Timeout | null = null;

  const speakNextSentence = () => {
    if (currentIndex >= sentences.length) {
      if (keepAliveInterval) clearInterval(keepAliveInterval);
      activeSpeechUtterance = null;
      onEnd?.();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const currentSentence = sentences[currentIndex];
      const utterance = new SpeechSynthesisUtterance(currentSentence);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const naturalVoice = voices.find(
        (v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel') || v.name.includes('Enhanced'))
      ) || voices.find((v) => v.lang.startsWith('en'));

      if (naturalVoice) {
        utterance.voice = naturalVoice;
      }

      utterance.onend = () => {
        currentIndex++;
        speakNextSentence();
      };

      utterance.onerror = (e) => {
        console.warn('Speech synthesis sentence error:', e);
        currentIndex++;
        speakNextSentence();
      };

      activeSpeechUtterance = utterance;
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Fallback speech exception:', err);
      currentIndex++;
      speakNextSentence();
    }
  };

  // Chrome long-speech keepalive pulse
  keepAliveInterval = setInterval(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.resume();
      }
    } else {
      if (keepAliveInterval) clearInterval(keepAliveInterval);
    }
  }, 2000);

  const existingVoices = window.speechSynthesis.getVoices();
  if (existingVoices && existingVoices.length > 0) {
    speakNextSentence();
  } else {
    const timer = setTimeout(() => speakNextSentence(), 200);
    window.speechSynthesis.onvoiceschanged = () => {
      clearTimeout(timer);
      speakNextSentence();
    };
  }
}
