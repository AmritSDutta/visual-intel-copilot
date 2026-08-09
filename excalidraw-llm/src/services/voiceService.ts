import { GoogleGenAI, Modality } from '@google/genai';

export const GEMINI_LIVE_MODELS = [
  { id: 'gemini-live-2.5-flash-native-audio', label: 'gemini-live-2.5-flash-native-audio (Native Audio ⭐)' },
  { id: 'gemini-2.5-flash-native-audio-preview-12-2025', label: 'gemini-2.5-flash-native-audio-preview-12-2025 (Native Audio Alt)' },
  { id: 'gemini-3-flash-live', label: 'gemini-3-flash-live (Fast Live)' }
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

class StreamingAudioPlayer {
  private audioCtx: AudioContext | null = null;
  private nextPlaybackTime = 0;
  private sampleRate = 24000;
  private onEnd?: () => void;
  private activeNodesCount = 0;
  private isGenerationComplete = false;

  constructor(sampleRate = 24000, onEnd?: () => void) {
    this.sampleRate = sampleRate;
    this.onEnd = onEnd;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    this.audioCtx = new AudioCtx({ sampleRate });
    this.nextPlaybackTime = this.audioCtx.currentTime;
  }

  public feed(base64Pcm: string) {
    if (!this.audioCtx || this.audioCtx.state === 'closed') return;

    try {
      const binaryString = atob(base64Pcm);
      const len = binaryString.length;
      const pcm16 = new Int16Array(len / 2);
      const dataView = new DataView(new Uint8Array(len).map((_, i) => binaryString.charCodeAt(i)).buffer);
      for (let i = 0; i < pcm16.length; i++) {
        pcm16[i] = dataView.getInt16(i * 2, true);
      }

      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768;
      }

      const audioBuffer = this.audioCtx.createBuffer(1, float32.length, this.sampleRate);
      audioBuffer.getChannelData(0).set(float32);

      const source = this.audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioCtx.destination);

      const now = this.audioCtx.currentTime;
      const startTime = Math.max(now, this.nextPlaybackTime);
      
      this.activeNodesCount++;
      source.onended = () => {
        this.activeNodesCount--;
        this.checkCompletion();
      };

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      source.start(startTime);
      this.nextPlaybackTime = startTime + audioBuffer.duration;
    } catch (e) {
      console.warn('[StreamingAudioPlayer] Error feeding chunk:', e);
    }
  }

  public signalGenerationComplete() {
    this.isGenerationComplete = true;
    this.checkCompletion();
  }

  private checkCompletion() {
    if (this.isGenerationComplete && this.activeNodesCount === 0) {
      this.close();
      this.onEnd?.();
    }
  }

  public close() {
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close();
      } catch {}
    }
    this.audioCtx = null;
  }
}

/**
 * Opens a Gemini Live API WebSocket session, sends text, and plays PCM audio
 * chunks immediately as they stream back from the server.
 * Returns true if audio was successfully streamed, false otherwise.
 */
async function speakWithLiveApi(
  text: string,
  apiKey: string,
  liveModel: string,
  onEnd?: () => void
): Promise<boolean> {
  try {
    console.log(`[Native Audio] Live API (Streaming) → ${liveModel}`);
    const ai = new GoogleGenAI({ apiKey, apiVersion: 'v1alpha' });
    let player: StreamingAudioPlayer | null = null;
    let hasAudio = false;

    await new Promise<void>((resolve, reject) => {
      ai.live.connect({
        model: liveModel,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
          }
        },
        callbacks: {
          onopen: () => {
            console.log(`[Native Audio] Live API WebSocket opened for model ${liveModel}`);
            player = new StreamingAudioPlayer(24000, () => {
              onEnd?.();
              resolve();
            });
          },
          onmessage: (msg: unknown) => {
            const m = msg as {
              serverContent?: {
                modelTurn?: { parts?: Array<{ inlineData?: { data?: string } }> };
                turnComplete?: boolean;
              };
            };
            for (const part of m.serverContent?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                hasAudio = true;
                player?.feed(part.inlineData.data);
              }
            }
            if (m.serverContent?.turnComplete) {
              player?.signalGenerationComplete();
            }
          },
          onerror: (e: unknown) => {
            player?.close();
            reject(e);
          },
          onclose: () => {
            player?.signalGenerationComplete();
          }
        }
      }).then((session) => {
        session.sendClientContent({
          turns: [{ role: 'user', parts: [{ text }] }],
          turnComplete: true
        });
      }).catch((e) => {
        player?.close();
        reject(e);
      });
    });

    return hasAudio;
  } catch (e) {
    console.warn(`[Native Audio] Live API ${liveModel} failed:`, e);
    return false;
  }
}

/**
 * Generate native audio response using Gemini Live API.
 * Primary:  gemini-live-2.5-flash-native-audio
 * Fallback: gemini-3-flash-live
 * Last resort: browser SpeechSynthesis (only if browserSpeechEnabled = true)
 */
export async function speakNativeAudioResponse(
  prompt: string,
  chatReply?: string,
  apiKey?: string,
  _modelName: string = 'gemini-live-2.5-flash-native-audio',
  onStart?: () => void,
  onEnd?: () => void,
  onError?: (err: string) => void,
  browserSpeechEnabled = false
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
    const played = await speakWithLiveApi(spokenInstruction, apiKey.trim(), liveModel, onEnd);
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
