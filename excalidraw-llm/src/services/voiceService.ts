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

/**
 * Plays base64 PCM audio using Web Audio API AudioContext
 */
function playPcmAudioData(base64Pcm: string, sampleRate = 24000, onEnd?: () => void): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx({ sampleRate });

      const binaryString = atob(base64Pcm);
      const len = binaryString.length;
      const pcm16 = new Int16Array(len / 2);
      const dataView = new DataView(new Uint8Array(len).map((_, i) => binaryString.charCodeAt(i)).buffer);
      for (let i = 0; i < pcm16.length; i++) {
        pcm16[i] = dataView.getInt16(i * 2, true); // Little endian PCM 16-bit
      }

      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768; // Normalize Int16 to Float32 [-1.0, 1.0]
      }

      const audioBuffer = audioCtx.createBuffer(1, float32.length, sampleRate);
      audioBuffer.getChannelData(0).set(float32);

      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);

      source.onended = () => {
        try {
          audioCtx.close();
        } catch {}
        activeAudioSourceNode = null;
        activeAudioContext = null;
        onEnd?.();
        resolve(true);
      };

      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      source.start(0);
      activeAudioSourceNode = source;
      activeAudioContext = audioCtx;
    } catch (e) {
      console.warn('Web Audio API playback failed:', e);
      resolve(false);
    }
  });
}

/**
 * Opens a Gemini Live API WebSocket session, sends text, collects PCM audio
 * chunks until turnComplete, then plays them via the Web Audio API.
 * Returns true if audio was successfully played, false otherwise.
 */
async function speakWithLiveApi(
  text: string,
  apiKey: string,
  liveModel: string,
  onEnd?: () => void
): Promise<boolean> {
  try {
    console.log(`[Native Audio] Live API → ${liveModel}`);
    const ai = new GoogleGenAI({ apiKey, apiVersion: 'v1alpha' });
    const audioChunks: Uint8Array[] = [];
    let resolved = false;

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
          },
          onmessage: (msg: unknown) => {
            console.log(`[Native Audio] Live API Raw message:`, JSON.stringify(msg));
            const m = msg as {
              serverContent?: {
                modelTurn?: { parts?: Array<{ inlineData?: { data?: string } }> };
                turnComplete?: boolean;
              };
            };
            for (const part of m.serverContent?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                console.log(`[Native Audio] Live API received chunk, length: ${part.inlineData.data.length}`);
                const raw = atob(part.inlineData.data);
                const bytes = new Uint8Array(raw.length);
                for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
                audioChunks.push(bytes);
              }
            }
            if (m.serverContent?.turnComplete && !resolved) {
              console.log(`[Native Audio] Live API turnComplete signaled`);
              resolved = true;
              resolve();
            }
          },
          onerror: (e: unknown) => {
            console.error(`[Native Audio] Live API error event:`, e);
            if (!resolved) { resolved = true; reject(e); }
          },
          onclose: (e: unknown) => {
            console.log(`[Native Audio] Live API connection closed:`, e);
            if (!resolved) { resolved = true; resolve(); }
          }
        }
      }).then((session) => {
        session.sendClientContent({
          turns: [{ role: 'user', parts: [{ text }] }],
          turnComplete: true
        });
      }).catch((e) => {
        if (!resolved) { resolved = true; reject(e); }
      });
    });

    if (audioChunks.length === 0) {
      console.warn(`[Native Audio] Live API (${liveModel}) returned no audio chunks`);
      return false;
    }

    // Merge all PCM chunks into one Uint8Array
    const total = audioChunks.reduce((n, c) => n + c.length, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of audioChunks) { merged.set(chunk, offset); offset += chunk.length; }

    // Convert merged bytes back to base64 for playPcmAudioData
    let bin = '';
    for (let i = 0; i < merged.length; i++) bin += String.fromCharCode(merged[i]);
    const b64 = btoa(bin);

    const played = await playPcmAudioData(b64, 24000, onEnd);
    if (played) {
      console.log(`[Native Audio] ✅ Live API played audio (${liveModel})`);
    }
    return played;
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
  _prompt: string,
  chatReply: string,
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

  const spokenInstruction = `You are a voice assistant. Speak the following reply aloud in 2 to 4 natural, engaging sentences: ${chatReply}`;

  if (!apiKey || !apiKey.trim()) {
    console.warn('[Native Audio] No Gemini API key — skipping Live API.');
    if (browserSpeechEnabled) {
      fallbackSpeechSynthesis(chatReply, onEnd, onError);
    } else {
      console.log('[Native Audio] Browser speech disabled in settings. Silent.');
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

  // 🥉 LAST RESORT: Browser speech (only if enabled in settings)
  if (browserSpeechEnabled) {
    console.log('[Native Audio] All Gemini Live paths failed — using browser speech synthesis.');
    fallbackSpeechSynthesis(chatReply, onEnd, onError);
  } else {
    console.log('[Native Audio] All Gemini Live paths failed. Browser speech disabled in settings. Silent.');
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
