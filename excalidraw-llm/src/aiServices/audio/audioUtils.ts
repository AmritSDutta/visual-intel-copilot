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
}

export class StreamingAudioPlayer {
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
      this.audioCtx = null;
    }
  }
}

export class PcmAudioRecorder {
  private mediaStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private onDataChunk?: (base64Pcm16: string) => void;
  private onLevel?: (level: number) => void;

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
        noiseSuppression: true
      }
    });

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    this.audioCtx = new AudioCtx({ sampleRate: 16000 });
    this.sourceNode = this.audioCtx.createMediaStreamSource(this.mediaStream);
    
    // ScriptProcessor for real-time 16kHz PCM chunks
    this.processorNode = this.audioCtx.createScriptProcessor(4096, 1, 1);
    this.processorNode.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      
      // Calculate RMS amplitude for visualizer
      let sum = 0;
      for (let i = 0; i < input.length; i++) {
        sum += input[i] * input[i];
      }
      const rms = Math.sqrt(sum / input.length);
      this.onLevel?.(Math.min(1, rms * 5));

      // Convert Float32 to Int16 PCM
      const pcm16 = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      // Convert to base64
      const uint8 = new Uint8Array(pcm16.buffer);
      let binary = '';
      for (let i = 0; i < uint8.length; i++) {
        binary += String.fromCharCode(uint8[i]);
      }
      this.onDataChunk?.(btoa(binary));
    };

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioCtx.destination);
  }

  public stop() {
    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch {}
      this.processorNode = null;
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
        this.audioCtx.close();
      } catch {}
      this.audioCtx = null;
    }
  }
}
