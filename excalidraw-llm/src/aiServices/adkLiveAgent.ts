import type {
  AdkAgentState,
  AdkTool,
  AdkLiveAgentConfig,
  AdkAgentCallbacks,
  AdkAgentMessage,
  AdkToolExecutionContext,
  AIDiagramResult
} from './types';
import { AsyncLock } from './asyncLock';
import { appLogger } from './logger';
import { createMultiAgentTools } from './agentTools';
import { GeminiLiveSession } from './liveSession';
import type { LiveToolCall } from './liveSession';
import { getLiveAgentSystemInstruction } from './prompts';
import { GEMINI_LIVE_MODELS } from '../services/voiceService';

export const START_GREETING_MESSAGE = "Hello! I am your Live Architecture companion. What system would you like to design today? You can also ask me to check your chat notes.";

/**
 * AdkLiveAgent — the MAIN agent of the /agentic workspace.
 *
 * It owns one native bidirectional Gemini Live audio session: it greets on connect,
 * converses in realtime, and dispatches tool calls raised by the live model to the
 * registered tools (canvas tools + the Groq-text / Mistral-diagram subagent tools).
 * There is no scripted routing — the model decides which tool to call, when.
 */
export class AdkLiveAgent {
  private static instance: AdkLiveAgent | null = null;
  private toolLock = new AsyncLock();

  private config: AdkLiveAgentConfig;
  private callbacks: AdkAgentCallbacks = {};
  private state: AdkAgentState = 'idle';
  private tools: Map<string, AdkTool> = new Map();
  private messages: AdkAgentMessage[] = [];
  private liveSession: GeminiLiveSession | null = null;

  constructor(config: AdkLiveAgentConfig, callbacks: AdkAgentCallbacks = {}) {
    this.config = config;
    this.callbacks = callbacks;

    appLogger.info('LIVE_AGENT', `Initialized Live Agent for session: ${config.sessionId}`, {
      geminiLiveModel: config.geminiModel || GEMINI_LIVE_MODELS[0]?.id,
      groqTextModel: config.groqModel || 'groq/compound',
      mistralDiagramModel: config.mistralModel || 'mistral-small-latest',
      hasGeminiKey: !!config.geminiApiKey,
      hasGroqKey: !!config.groqApiKey,
      hasMistralKey: !!config.mistralApiKey
    });

    this.rebuildTools();
  }

  public static getOrCreateInstance(
    config: AdkLiveAgentConfig,
    callbacks: AdkAgentCallbacks = {}
  ): AdkLiveAgent {
    if (!AdkLiveAgent.instance || AdkLiveAgent.instance.getSessionId() !== config.sessionId) {
      if (AdkLiveAgent.instance) {
        appLogger.info('SINGLETON', `Tearing down old session ${AdkLiveAgent.instance.getSessionId()} -> starting ${config.sessionId}`);
        AdkLiveAgent.instance.destroy();
      }
      AdkLiveAgent.instance = new AdkLiveAgent(config, callbacks);
    } else {
      AdkLiveAgent.instance.updateConfig(config);
      if (config.context) {
        AdkLiveAgent.instance.updateContext(config.context);
      }
      AdkLiveAgent.instance.setCallbacks(callbacks);
    }
    return AdkLiveAgent.instance;
  }

  public static getInstance(): AdkLiveAgent | null {
    return AdkLiveAgent.instance;
  }

  public static releaseInstance(): void {
    if (AdkLiveAgent.instance) {
      appLogger.info('SINGLETON', `Releasing Live Agent instance: ${AdkLiveAgent.instance.getSessionId()}`);
      AdkLiveAgent.instance.destroy();
      AdkLiveAgent.instance = null;
    }
  }

  public getSessionId(): string {
    return this.config.sessionId;
  }

  public getState(): AdkAgentState {
    return this.state;
  }

  public getMessages(): AdkAgentMessage[] {
    return [...this.messages];
  }

  public isVoiceActive(): boolean {
    return this.liveSession?.isActive ?? false;
  }

  public setCallbacks(callbacks: AdkAgentCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /** Silent memory write (chat notes box) — does not trigger an agent turn. */
  public appendUserNote(text: string): AdkAgentMessage {
    const noteMsg: AdkAgentMessage = {
      id: `note_${Date.now()}`,
      role: 'user',
      content: text,
      subagentUsed: '📝 Note',
      timestamp: Date.now()
    };
    this.messages.push(noteMsg);
    appLogger.info('CHAT_NOTE', `Appended user note to memory: "${text.substring(0, 60)}..."`);
    return noteMsg;
  }

  public updateConfig(newConfig: Partial<AdkLiveAgentConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.rebuildTools();
  }

  public updateContext(contextUpdate: Partial<AdkToolExecutionContext>): void {
    this.config.context = { ...(this.config.context ?? {}), ...contextUpdate };
  }

  // ── voice session lifecycle ───────────────────────────────

  /** Opens the native bidirectional Live session and delivers the greeting. */
  public async startVoiceSession(): Promise<void> {
    if (this.liveSession?.isActive) {
      appLogger.warn('LIVE_AGENT', 'Voice session already active — ignoring start.');
      return;
    }
    if (!this.config.geminiApiKey?.trim()) {
      throw new Error('A Gemini API key is required for the Agentic workspace (it drives the live session). Please add it in Settings (⚙️).');
    }

    const models = Array.from(new Set([
      ...GEMINI_LIVE_MODELS.map((m) => m.id)
    ]));

    this.liveSession = new GeminiLiveSession({
      apiKey: this.config.geminiApiKey.trim(),
      models,
      systemInstruction: getLiveAgentSystemInstruction(START_GREETING_MESSAGE),
      tools: [...this.tools.values()],
      voiceName: this.config.studioVoice || 'Puck',
      callbacks: {
        onOpen: () => {
          this.setState('listening');
          // Hidden control turn — the persona makes the model speak its greeting now.
          this.liveSession?.sendText('(Session just started. Deliver your greeting now, exactly as instructed.)');
        },
        onUserTranscript: (text) => {
          this.messages.push({
            id: `msg_${Date.now()}_u`,
            role: 'user',
            content: text,
            timestamp: Date.now()
          });
          this.callbacks.onTranscript?.(text, true, 'user');
        },
        onAgentTranscript: (text, isFinal) => {
          this.callbacks.onTranscript?.(text, isFinal, 'agent');
          if (isFinal) {
            this.messages.push({
              id: `msg_${Date.now()}_a`,
              role: 'assistant',
              content: text,
              subagentUsed: '🎙️ Live Agent',
              timestamp: Date.now()
            });
          }
        },
        onToolCalls: (calls) => void this.handleToolCalls(calls),
        onSpeakingChange: (speaking) => this.setState(speaking ? 'speaking' : 'listening'),
        onUserSpeech: (active) => {
          if (active) this.setState('listening');
        },
        onAudioLevel: (level) => this.callbacks.onAudioLevel?.(level),
        onError: (err) => {
          appLogger.error('LIVE_AGENT', `Live session error: ${err.message}`);
          this.setState('error');
          this.callbacks.onError?.(err);
        },
        onClose: () => {
          this.liveSession = null;
          this.setState('idle');
        }
      }
    });

    try {
      await this.liveSession.start();
    } catch (err) {
      this.liveSession = null;
      this.setState('error');
      throw err;
    }
  }

  /** Closes the live session (mic + speaker + socket). */
  public async stopVoiceSession(): Promise<void> {
    if (this.liveSession) {
      await this.liveSession.stop();
      this.liveSession = null;
    }
    this.setState('idle');
  }

  /** Typed chat-box message — sent into the live session as a user turn. */
  public sendTextMessage(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (!this.liveSession?.isActive) {
      throw new Error('The live session is not active — start the mic first (or restart it).');
    }

    this.messages.push({
      id: `msg_${Date.now()}_u`,
      role: 'user',
      content: trimmed,
      timestamp: Date.now()
    });
    this.callbacks.onTranscript?.(trimmed, true, 'user');
    this.setState('thinking');
    this.liveSession.sendText(trimmed);
  }

  // ── tool dispatch (the live model decides when) ───────────

  private async handleToolCalls(calls: LiveToolCall[]): Promise<void> {
    await this.toolLock.runExclusive(async () => {
      this.setState('thinking');
      const context: AdkToolExecutionContext = {
        ...this.config.context,
        sessionId: this.config.sessionId,
        rawLibraryItems: this.config.rawLibraryItems || [],
        onSubagentProgress: (ev) => this.callbacks.onSubagentActivity?.(ev)
      };

      const responses = [];
      const toolsUsed: Array<{ name: string; args: Record<string, any> }> = [];

      for (const call of calls) {
        const tool = this.tools.get(call.name);
        appLogger.tool('TOOL', `Live model → ${call.name}`, call.args);

        let result: any;
        if (!tool) {
          result = { error: `Unknown tool: ${call.name}` };
        } else {
          try {
            result = await tool.execute(call.args, context);
          } catch (err: any) {
            appLogger.error('TOOL', `${call.name} failed: ${err.message}`);
            result = { error: err.message };
          }
        }

        toolsUsed.push({ name: call.name, args: call.args });
        responses.push({ id: call.id, name: call.name, response: result ?? {} });

        // Diagram tools return { elements } — surface the new canvas to the UI.
        const elements = (result as AIDiagramResult | undefined)?.elements;
        if (Array.isArray(elements) && elements.length > 0) {
          this.callbacks.onDiagramGenerated?.({
            chatReply: (result as AIDiagramResult).chatReply || '',
            elements
          });
        }
      }

      if (toolsUsed.length > 0) {
        this.messages.push({
          id: `msg_${Date.now()}_t`,
          role: 'assistant',
          content: `Used tools: ${toolsUsed.map((t) => t.name).join(', ')}`,
          subagentUsed: '🛠️ Tools',
          toolCalls: toolsUsed,
          timestamp: Date.now()
        });
      }

      this.liveSession?.sendToolResponses(responses);
      appLogger.info('TOOL', `Replied to ${responses.length} tool call(s); live model resumes.`);
    });
  }

  // ── session upkeep ─────────────────────────────────────────

  public resetSession(newSessionId: string): void {
    appLogger.info('SESSION', `Resetting session memory for new ID: ${newSessionId}`);
    void this.stopVoiceSession();
    this.config.sessionId = newSessionId;
    this.messages = [];
    this.setState('idle');
  }

  public destroy(): void {
    appLogger.info('SESSION', `Destroying Live Agent instance: ${this.config.sessionId}`);
    void this.stopVoiceSession();
    this.messages = [];
    this.tools.clear();
  }

  private rebuildTools(): void {
    const tools = createMultiAgentTools({
      geminiApiKey: this.config.geminiApiKey,
      groqApiKey: this.config.groqApiKey,
      mistralApiKey: this.config.mistralApiKey,
      groqModel: this.config.groqModel || 'groq/compound',
      mistralModel: this.config.mistralModel || 'mistral-small-latest',
      geminiModel: this.config.geminiModel,
      getMessages: () => this.messages
    });
    this.tools.clear();
    tools.forEach((t) => this.tools.set(t.name, t));
  }

  private setState(nextState: AdkAgentState): void {
    if (this.state === nextState) return;
    this.state = nextState;
    this.callbacks.onStateChange?.(nextState);
  }
}
