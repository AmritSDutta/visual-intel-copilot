import { appLogger } from '../utils/logger';

export interface VadCallbacks {
  onVoiceStart?: () => void;
  onVoiceEnd?: () => void;
  onAudioLevel?: (level: number) => void;
  onError?: (error: Error) => void;
}

export interface VadConfig {
  threshold?: number;        // RMS energy threshold (default 0.02)
  vadHangoverMs?: number;    // Hangover smoothing (default 600ms)
}

/**
 * Browser-native Web Audio RMS Voice Activity Detection (VAD) engine.
 * Calculates real-time root-mean-square energy and manages speech hangover state.
 */
export class BrowserVAD {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private animationFrameId: number | null = null;

  private isRunning = false;
  private isVoiceDetected = false;
  private lastVoiceTime = 0;

  private threshold: number;
  private vadHangoverMs: number;
  private callbacks: VadCallbacks;

  constructor(callbacks: VadCallbacks = {}, config: VadConfig = {}) {
    this.callbacks = callbacks;
    this.threshold = config.threshold ?? 0.02;
    this.vadHangoverMs = config.vadHangoverMs ?? 600;
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtx();
      this.sourceNode = this.audioCtx.createMediaStreamSource(this.micStream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.3;

      this.sourceNode.connect(this.analyser);
      this.isRunning = true;
      this.lastVoiceTime = 0;

      appLogger.info('VAD', '🎙️ Web Audio RMS VAD started successfully');
      this._pollAudioLevel();
    } catch (err: any) {
      appLogger.error('VAD', `Failed to initialize microphone VAD: ${err.message}`, err);
      this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private _pollAudioLevel = () => {
    if (!this.isRunning || !this.analyser) return;

    const dataArray = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(dataArray);

    // Compute RMS Energy
    let sumSquares = 0.0;
    for (let i = 0; i < dataArray.length; i++) {
      sumSquares += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sumSquares / dataArray.length);

    // Normalize level (0.0 to 1.0) for UI waveforms
    const normalizedLevel = Math.min(1.0, rms * 5.0);
    this.callbacks.onAudioLevel?.(normalizedLevel);

    const now = Date.now();

    // VAD Logic with Hangover smoothing (like Chouw)
    if (rms >= this.threshold) {
      this.lastVoiceTime = now;
      if (!this.isVoiceDetected) {
        this.isVoiceDetected = true;
        appLogger.info('VAD', `Speech detected (RMS: ${rms.toFixed(3)} >= ${this.threshold})`);
        this.callbacks.onVoiceStart?.();
      }
    } else {
      // In Hangover window?
      if (this.isVoiceDetected && (now - this.lastVoiceTime > this.vadHangoverMs)) {
        this.isVoiceDetected = false;
        appLogger.info('VAD', `Silence detected after speech (Hangover ${this.vadHangoverMs}ms expired)`);
        this.callbacks.onVoiceEnd?.();
      }
    }

    this.animationFrameId = requestAnimationFrame(this._pollAudioLevel);
  };

  public isVoiceActive(): boolean {
    return this.isVoiceDetected;
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch {}
      this.sourceNode = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try { this.audioCtx.close(); } catch {}
      this.audioCtx = null;
    }
    this.analyser = null;
    this.isVoiceDetected = false;
    appLogger.info('VAD', 'Microphone VAD stopped');
  }
}
