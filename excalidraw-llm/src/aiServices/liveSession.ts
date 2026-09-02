import { GoogleGenAI, Modality } from '@google/genai';
import type { LiveServerMessage, Session } from '@google/genai';
import { PcmAudioRecorder, StreamingAudioPlayer, unlockAudioContext } from './audioUtils';
import { appLogger } from './logger';
import type { AdkTool } from './types';

/** A function call the live model raised mid-conversation. */
export interface LiveToolCall {
  id?: string;
  name: string;
  args: Record<string, any>;
}

/** A function result sent back so the model can continue its turn. */
export interface LiveToolResponse {
  id?: string;
  name: string;
  response: Record<string, any>;
}

export interface LiveSessionCallbacks {
  onOpen?: () => void;
  /** Server VAD detected the user started/stopped speaking. */
  onUserSpeech?: (active: boolean) => void;
  /** Transcript of what the user said (input transcription, final per turn). */
  onUserTranscript?: (text: string) => void;
  /** Transcript of what the model is speaking (output transcription, incremental). */
  onAgentTranscript?: (text: string, isFinal: boolean) => void;
  onSpeakingChange?: (speaking: boolean) => void;
  /** Model raised one or more tool calls — execute and reply via sendToolResponses(). */
  onToolCalls?: (calls: LiveToolCall[]) => void;
  onAudioLevel?: (level: number) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

export interface GeminiLiveSessionOptions {
  apiKey: string;
  /** Ordered fallback chain of native-audio live models. */
  models: string[];
  systemInstruction: string;
  tools: AdkTool[];
  voiceName?: string;
  callbacks?: LiveSessionCallbacks;
}

function toFunctionDeclarations(tools: AdkTool[]) {
  return tools.map((tool) => ({
    functionDeclarations: [{
      name: tool.name,
      description: tool.description,
      parameters: JSON.parse(JSON.stringify(tool.parameters))
    }]
  }));
}

/**
 * One native bidirectional Gemini Live session:
 * mic PCM in (server VAD), model PCM out (gapless player),
 * transcripts out, and mid-conversation tool calls.
 */
export class GeminiLiveSession {
  private session: Session | null = null;
  private recorder = new PcmAudioRecorder();
  private player: StreamingAudioPlayer | null = null;
  private callbacks: LiveSessionCallbacks;
  private readonly opts: GeminiLiveSessionOptions;
  private userTranscriptBuffer = '';
  private agentTranscriptBuffer = '';
  private _isActive = false;

  constructor(opts: GeminiLiveSessionOptions) {
    this.opts = opts;
    this.callbacks = opts.callbacks ?? {};
  }

  public get isActive(): boolean {
    return this._isActive;
  }

  /** Connects (with model fallback chain), starts streaming the mic, and delivers the greeting turn. */
  public async start(): Promise<void> {
    unlockAudioContext();

    const ai = new GoogleGenAI({ apiKey: this.opts.apiKey, apiVersion: 'v1alpha' });
    const config = {
      systemInstruction: this.opts.systemInstruction,
      tools: toFunctionDeclarations(this.opts.tools),
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: this.opts.voiceName || 'Puck' } }
      },
      outputAudioTranscription: {},
      inputAudioTranscription: {}
    };

    let lastError: unknown = null;
    for (const model of this.opts.models) {
      try {
        appLogger.info('LIVE_SESSION', `Connecting to ${model}…`);
        this.session = await ai.live.connect({ model, config, callbacks: this.buildCallbacks(model) });
        this._isActive = true;
        break;
      } catch (err) {
        appLogger.warn('LIVE_SESSION', `${model} failed, trying next model`, { error: String(err) });
        lastError = err;
      }
    }

    if (!this.session) {
      throw new Error(`Live session failed across all models: ${String(lastError)}`);
    }

    await this.recorder.start(
      (base64Pcm) => this.session?.sendRealtimeInput({
        audio: { data: base64Pcm, mimeType: 'audio/pcm;rate=16000' }
      }),
      (level) => this.callbacks.onAudioLevel?.(level)
    );

    this.callbacks.onOpen?.();
  }

  /** Typed input from the chat box — the model answers in audio + transcript. */
  public sendText(text: string): void {
    if (!this.session || !this._isActive) {
      throw new Error('Live session is not active.');
    }
    this.session.sendClientContent({
      turns: [{ role: 'user', parts: [{ text }] }],
      turnComplete: true
    });
  }

  /** Replies to tool calls raised via onToolCalls — required before the model continues. */
  public sendToolResponses(responses: LiveToolResponse[]): void {
    this.session?.sendToolResponse({
      functionResponses: responses.map((r) => ({
        id: r.id,
        name: r.name,
        response: r.response
      }))
    });
  }

  /** Stops mic, closes the socket and the player. Safe to call repeatedly. */
  public async stop(): Promise<void> {
    this._isActive = false;
    this.userTranscriptBuffer = '';
    this.agentTranscriptBuffer = '';
    this.callbacks.onSpeakingChange?.(false);

    this.recorder.stop();
    this.closePlayer();

    if (this.session) {
      try {
        this.session.close();
      } catch {
        // socket already closing — nothing to do
      }
      this.session = null;
    }
  }

  // ── internals ──────────────────────────────────────────────

  private buildCallbacks(model: string) {
    return {
      onopen: () => {
        appLogger.info('LIVE_SESSION', `WebSocket opened (${model})`);
      },
      onmessage: (msg: LiveServerMessage) => this.handleMessage(msg),
      onerror: (err: unknown) => {
        appLogger.error('LIVE_SESSION', `Session error on ${model}: ${String(err)}`);
        this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
      },
      onclose: (e?: any) => {
        const code = e?.code ?? 'unknown';
        const reason = e?.reason || 'No reason provided';
        appLogger.info('LIVE_SESSION', `WebSocket closed (${model}) [code: ${code}, reason: "${reason}"]`);
        const wasActive = this._isActive;
        void this.stop();
        if (wasActive) {
          this.callbacks.onClose?.();
        }
      }
    };
  }

  private handleMessage(msg: LiveServerMessage): void {
    // 1. Tool calls — hand to the agent, it must reply via sendToolResponses()
    const calls = (msg.toolCall?.functionCalls ?? []).filter((c) => !!c.name);
    if (calls.length > 0) {
      this.callbacks.onToolCalls?.(calls.map((c) => ({
        id: c.id,
        name: c.name as string,
        args: (c.args as Record<string, any>) ?? {}
      })));
      return;
    }

    const content = msg.serverContent;

    // 2. Barge-in: user interrupted — kill playback immediately
    //    (typed surface of the SDK doesn't expose `interruption` yet — check the raw shape)
    if ((content as { interruption?: unknown } | undefined)?.interruption) {
      this.closePlayer();
      this.callbacks.onSpeakingChange?.(false);
      this.agentTranscriptBuffer = '';
    }

    // 3. Model audio → gapless playback
    if (content?.modelTurn) {
      for (const part of content.modelTurn.parts ?? []) {
        const data = part.inlineData?.data;
        if (data) {
          if (!this.player) {
            this.player = new StreamingAudioPlayer(24000, () => {
              this.callbacks.onSpeakingChange?.(false);
              this.player = null;
            });
          }
          this.callbacks.onSpeakingChange?.(true);
          this.player.feed(data);
        }
      }
      const spoken = content.modelTurn.parts?.map((p) => p.text).filter(Boolean).join('') ?? '';
      if (spoken) {
        this.agentTranscriptBuffer += spoken;
        this.callbacks.onAgentTranscript?.(this.agentTranscriptBuffer, false);
      }
    }

    // 4. Output transcription (what the model actually said) — per-part incremental
    const outText = content?.outputTranscription?.text;
    if (outText) {
      this.agentTranscriptBuffer += outText;
      this.callbacks.onAgentTranscript?.(this.agentTranscriptBuffer, false);
    }

    // 5. Input transcription (what the user said) — flushed as one final per turn
    const inText = content?.inputTranscription?.text;
    if (inText) {
      this.userTranscriptBuffer += inText;
      this.callbacks.onUserSpeech?.(true);
    }

    // 6. Server VAD turn boundaries
    if (content?.turnComplete) {
      if (this.userTranscriptBuffer.trim()) {
        this.callbacks.onUserTranscript?.(this.userTranscriptBuffer.trim());
        this.userTranscriptBuffer = '';
      }
      if (this.agentTranscriptBuffer.trim()) {
        this.callbacks.onAgentTranscript?.(this.agentTranscriptBuffer.trim(), true);
        this.agentTranscriptBuffer = '';
      }
      this.player?.signalGenerationComplete();
      this.callbacks.onUserSpeech?.(false);
    }
  }

  private closePlayer(): void {
    if (this.player) {
      this.player.close();
      this.player = null;
    }
  }
}
