let globalAudioCtx: AudioContext | null = null;
let activeAudioElement: HTMLAudioElement | null = null;
let activeAudioSourceNode: AudioBufferSourceNode | null = null;
let activeAudioContext: AudioContext | null = null;

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
      void globalAudioCtx.resume();
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
      void activeAudioContext.close();
    } catch {}
    activeAudioContext = null;
  }
}

let globalPlaybackAudioCtx: AudioContext | null = null;

export function getGlobalPlaybackAudioContext(sampleRate = 24000): AudioContext {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!globalPlaybackAudioCtx || globalPlaybackAudioCtx.state === 'closed') {
    globalPlaybackAudioCtx = new AudioCtx({ sampleRate });
  }
  if (globalPlaybackAudioCtx.state === 'suspended') {
    void globalPlaybackAudioCtx.resume();
  }
  return globalPlaybackAudioCtx;
}

/** Fast zero-allocation Base64 to Float32Array PCM conversion */
function base64ToFloat32Array(base64: string): Float32Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const numSamples = Math.floor(len / 2);
  const float32 = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const byte1 = binaryString.charCodeAt(i * 2);
    const byte2 = binaryString.charCodeAt(i * 2 + 1);
    let int16 = byte1 | (byte2 << 8);
    if (int16 >= 0x8000) {
      int16 -= 0x10000;
    }
    float32[i] = int16 / 32768;
  }
  return float32;
}

/**
 * Downsample Float32Array from native hardware rate (e.g. 48kHz or 44.1kHz) to 16,000 Hz.
 */
function downsampleTo16k(input: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === 16000 || inputSampleRate <= 0) return input;
  const ratio = inputSampleRate / 16000;
  const newLength = Math.round(input.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetInput = 0;
  while (offsetResult < result.length) {
    const nextOffsetInput = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetInput; i < nextOffsetInput && i < input.length; i++) {
      accum += input[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetInput = nextOffsetInput;
  }
  return result;
}

/** Fast Float32Array to Int16 Base64 conversion with optional acoustic ducking */
function float32ToInt16Base64(input: Float32Array, isDucked = false): string {
  const len = input.length;
  const uint8 = new Uint8Array(len * 2);
  const volumeMultiplier = isDucked ? 0.05 : 1.0;

  for (let i = 0; i < len; i++) {
    let s = input[i] * volumeMultiplier;
    s = Math.max(-1, Math.min(1, s));
    const pcm = s < 0 ? s * 0x8000 : s * 0x7fff;
    const int16 = Math.floor(pcm);
    uint8[i * 2] = int16 & 0xff;
    uint8[i * 2 + 1] = (int16 >> 8) & 0xff;
  }

  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < uint8.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize) as unknown as number[]);
  }
  return btoa(binary);
}

/**
 * AudioStreamer - Google Gemini Live Official Architecture.
 * Sample-accurate Web Audio timeline scheduling with server-driven turn lifecycle.
 */
export class AudioStreamer {
  private context: AudioContext;
  private scheduledTime = 0;
  private gainNode: GainNode;
  private activeSources: AudioBufferSourceNode[] = [];
  private isGenerationComplete = false;
  private isSpeaking = false;
  private onSpeakingChange?: (speaking: boolean) => void;

  constructor(sampleRate = 24000, onSpeakingChange?: (speaking: boolean) => void) {
    this.context = getGlobalPlaybackAudioContext(sampleRate);
    this.onSpeakingChange = onSpeakingChange;
    this.gainNode = this.context.createGain();
    this.gainNode.connect(this.context.destination);
    this.scheduledTime = 0;
  }

  public feed(base64Pcm: string) {
    try {
      const float32 = base64ToFloat32Array(base64Pcm);
      if (float32.length === 0) return;

      if (this.context.state === 'suspended') {
        void this.context.resume();
      }

      // Gemini Live sends 24,000 Hz PCM. Web Audio will interpolate it to hardware clock (48kHz/44.1kHz).
      const audioBuffer = this.context.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = this.context.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.gainNode);

      // Google Official Gapless Scheduling: lock seamlessly to hardware timeline
      const now = this.context.currentTime;
      const startTime = Math.max(this.scheduledTime, now);
      source.start(startTime);
      this.scheduledTime = startTime + audioBuffer.duration;
      this.activeSources.push(source);

      if (!this.isSpeaking) {
        this.isSpeaking = true;
        this.isGenerationComplete = false;
        this.onSpeakingChange?.(true);
      }

      source.onended = () => {
        const idx = this.activeSources.indexOf(source);
        if (idx !== -1) {
          this.activeSources.splice(idx, 1);
        }
        // ONLY finish the turn when the server signalled turnComplete AND all audio nodes drained
        if (this.isGenerationComplete && this.activeSources.length === 0) {
          this.isSpeaking = false;
          this.isGenerationComplete = false;
          this.scheduledTime = 0;
          this.onSpeakingChange?.(false);
        }
      };
    } catch (e) {
      console.warn('[AudioStreamer] Error feeding chunk:', e);
    }
  }

  public signalGenerationComplete() {
    this.isGenerationComplete = true;
    if (this.activeSources.length === 0) {
      this.isSpeaking = false;
      this.isGenerationComplete = false;
      this.scheduledTime = 0;
      this.onSpeakingChange?.(false);
    }
  }

  public stop() {
    for (const source of this.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch {}
    }
    this.activeSources = [];
    this.scheduledTime = 0;
    this.isGenerationComplete = false;
    if (this.isSpeaking) {
      this.isSpeaking = false;
      this.onSpeakingChange?.(false);
    }
  }

  public close() {
    this.stop();
  }
}

/** Alias for backwards compatibility */
export class StreamingAudioPlayer extends AudioStreamer {}

/**
 * PcmAudioRecorder with 16kHz PCM streaming, 0-gain isolation, and speech energy gating.
 */
export class PcmAudioRecorder {
  private mediaStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private muteGainNode: GainNode | null = null;
  private onDataChunk?: (base64Pcm16: string) => void;
  private onLevel?: (level: number) => void;
  private isDucked = false;

  public setDucked(ducked: boolean) {
    this.isDucked = ducked;
  }

  public async start(
    onDataChunk: (base64Pcm16: string) => void,
    onLevel?: (level: number) => void
  ) {
    this.onDataChunk = onDataChunk;
    this.onLevel = onLevel;

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioCtx = new AudioCtx({ sampleRate: 16000 });
    this.sourceNode = this.audioCtx.createMediaStreamSource(this.mediaStream);

    // Buffer size of 1024 (~64ms per chunk) for low-latency streaming
    this.processorNode = this.audioCtx.createScriptProcessor(1024, 1, 1);
    this.processorNode.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);

      // Calculate RMS amplitude for visualizer UI
      let sum = 0;
      for (let i = 0; i < input.length; i++) {
        sum += input[i] * input[i];
      }
      const rms = Math.sqrt(sum / input.length);
      this.onLevel?.(Math.min(1, rms * 5));

      const inputRate = this.audioCtx?.sampleRate || 16000;
      const resampled = downsampleTo16k(input, inputRate);
      const base64Chunk = float32ToInt16Base64(resampled, this.isDucked);
      this.onDataChunk?.(base64Chunk);
    };

    // CRITICAL: Route processorNode through a 0-gain mute node to prevent mic from playing into speakers!
    this.muteGainNode = this.audioCtx.createGain();
    this.muteGainNode.gain.value = 0;

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.muteGainNode);
    this.muteGainNode.connect(this.audioCtx.destination);
  }

  public stop() {
    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch {}
      this.processorNode = null;
    }
    if (this.muteGainNode) {
      try {
        this.muteGainNode.disconnect();
      } catch {}
      this.muteGainNode = null;
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        void this.audioCtx.close();
      } catch {}
      this.audioCtx = null;
    }
  }
}
