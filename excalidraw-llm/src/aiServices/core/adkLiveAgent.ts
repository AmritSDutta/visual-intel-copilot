import type {
  AdkAgentState,
  AdkTool,
  AdkLiveAgentConfig,
  AdkAgentCallbacks,
  AdkAgentMessage,
  AdkExecutionResult,
  AdkToolExecutionContext
} from './types';
import { AsyncLock } from '../utils/asyncLock';
import { appLogger } from '../utils/logger';
import { extractCanvasTopology } from '../tools/canvasTools';
import { createMultiAgentTools } from '../tools/agentTools';
import { generateTextExplanationWithGroq } from '../llmServices/groqService';
import { generateDiagramElementsWithMistral } from '../llmServices/mistralService';
import { generateDiagramFromPrompt } from '../llmServices/geminiService';
import { speakNativeAudioResponse, stopAudioResponse, unlockAudioContext } from '../../services/voiceService';

export const START_GREETING_MESSAGE = "Hello! I am your Live Architecture Copilot. What system would you like to design today? You can also ask me to check your chat notes.";

export class AdkLiveAgent {
  private static instance: AdkLiveAgent | null = null;
  private executionLock = new AsyncLock();

  private config: AdkLiveAgentConfig;
  private callbacks: AdkAgentCallbacks;
  private state: AdkAgentState = 'idle';
  private tools: Map<string, AdkTool> = new Map();
  private messages: AdkAgentMessage[] = [];
  private isVoiceSessionActive: boolean = false;

  constructor(config: AdkLiveAgentConfig, callbacks: AdkAgentCallbacks = {}) {
    this.config = config;
    this.callbacks = callbacks;

    appLogger.info('LIVE_AGENT', `Initialized Live Agent for session: ${config.sessionId}`, {
      geminiAudioModel: config.geminiModel || 'gemini-2.5-flash',
      groqTextModel: config.groqModel || 'llama-3.3-70b-versatile',
      mistralDiagramModel: config.mistralModel || 'mistral-small-latest',
      hasGeminiKey: !!config.geminiApiKey,
      hasGroqKey: !!config.groqApiKey,
      hasMistralKey: !!config.mistralApiKey
    });

    const defaultTools = createMultiAgentTools({
      geminiApiKey: config.geminiApiKey,
      groqApiKey: config.groqApiKey,
      mistralApiKey: config.mistralApiKey,
      groqModel: config.groqModel || 'llama-3.3-70b-versatile',
      mistralModel: config.mistralModel || 'mistral-small-latest',
      geminiModel: config.geminiModel,
      getMessages: () => this.messages
    });

    defaultTools.forEach((tool) => this.tools.set(tool.name, tool));
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
    return this.isVoiceSessionActive;
  }

  public setVoiceActive(active: boolean): void {
    this.isVoiceSessionActive = active;
    appLogger.info('VOICE', `Voice active state set to: ${active}`);
    if (!active) {
      stopAudioResponse();
      this.setState('idle');
    }
  }

  public setCallbacks(callbacks: AdkAgentCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  public async greetUserOnLiveStart(): Promise<void> {
    appLogger.info('LIVE_GREETING', '🔊 Delivering Gemini Native Live Audio greeting');
    unlockAudioContext();

    const greetingMsg: AdkAgentMessage = {
      id: `msg_greet_${Date.now()}`,
      role: 'assistant',
      content: START_GREETING_MESSAGE,
      subagentUsed: '🎙️ Live Agent',
      timestamp: Date.now()
    };
    this.messages.push(greetingMsg);
    this.callbacks.onTranscript?.(START_GREETING_MESSAGE, true, 'agent');

    speakNativeAudioResponse(
      '',
      START_GREETING_MESSAGE,
      this.config.geminiApiKey,
      this.config.geminiModel || 'gemini-2.5-flash',
      () => this.setState('speaking'),
      () => this.setState('idle'),
      (err) => {
        appLogger.warn('GREETING_AUDIO', `Greeting audio notice: ${err}`);
        this.setState('idle');
      },
      false,
      this.config.studioVoice || 'Puck'
    );
  }

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
    const updatedTools = createMultiAgentTools({
      geminiApiKey: this.config.geminiApiKey,
      groqApiKey: this.config.groqApiKey,
      mistralApiKey: this.config.mistralApiKey,
      groqModel: this.config.groqModel || 'llama-3.3-70b-versatile',
      mistralModel: this.config.mistralModel || 'mistral-small-latest',
      geminiModel: this.config.geminiModel,
      getMessages: () => this.messages
    });
    this.tools.clear();
    updatedTools.forEach((t) => this.tools.set(t.name, t));
  }

  public updateContext(contextUpdate: Partial<AdkToolExecutionContext>): void {
    if (!this.config.context) {
      this.config.context = {};
    }
    this.config.context = { ...this.config.context, ...contextUpdate };
  }

  private setState(nextState: AdkAgentState): void {
    this.state = nextState;
    this.callbacks.onStateChange?.(nextState);
  }

  public async processUserPrompt(
    voiceQuery: string,
    options: { isVoiceInput?: boolean } = {}
  ): Promise<AdkExecutionResult> {
    if (!voiceQuery.trim()) {
      throw new Error('Prompt cannot be empty.');
    }

    const hasGemini = !!this.config.geminiApiKey?.trim();
    const hasGroq = !!this.config.groqApiKey?.trim();
    const hasMistral = !!this.config.mistralApiKey?.trim();

    if (!hasGemini && !hasGroq && !hasMistral) {
      throw new Error('Please configure at least one API key (Gemini, Groq, or Mistral) in Settings (⚙️) to use the Agentic workspace.');
    }

    appLogger.info('ORCHESTRATOR', `Processing prompt [Voice: ${!!options.isVoiceInput}]: "${voiceQuery}"`);

    return await this.executionLock.runExclusive(async () => {
      unlockAudioContext();

      const userMsg: AdkAgentMessage = {
        id: `msg_${Date.now()}_u`,
        role: 'user',
        content: voiceQuery,
        timestamp: Date.now()
      };
      this.messages.push(userMsg);
      this.callbacks.onTranscript?.(voiceQuery, true, 'user');
      this.setState('thinking');

      const rawLibraryItems = this.config.rawLibraryItems || [];
      const executionContext: AdkToolExecutionContext = {
        ...this.config.context,
        sessionId: this.config.sessionId,
        rawLibraryItems,
        onSubagentProgress: (ev) => this.callbacks.onSubagentActivity?.(ev)
      };

      const existingElements = executionContext.getCanvasElements ? executionContext.getCanvasElements() : [];
      const canvasTopology = extractCanvasTopology(existingElements);

      appLogger.info('CANVAS', `Canvas topology inspected: ${canvasTopology.nodeCount} nodes, ${canvasTopology.connectorCount} connectors`);

      const lowerQuery = voiceQuery.toLowerCase().trim();
      const isChatCheck = lowerQuery.includes('check the chat') || lowerQuery.includes('read the chat') ||
                          lowerQuery.includes('look at the chat') || lowerQuery.includes('what is in the chat') ||
                          lowerQuery.includes('my note') || lowerQuery.includes('in chat');

      const isCanvasQuestion = lowerQuery.includes('what is on') || lowerQuery.includes('what do i have') ||
                               lowerQuery.includes('explain diagram') || lowerQuery.includes('inspect canvas');

      const isModification = (lowerQuery.includes('rename') || lowerQuery.includes('change') || lowerQuery.includes('add a') || lowerQuery.includes('delete')) &&
                             canvasTopology.nodeCount > 0 && !lowerQuery.includes('draw a new');

      try {
        let chatReply = '';
        let elements: any[] = [];
        const toolsUsed: string[] = [];
        const badges: string[] = [];

        if (isChatCheck) {
          toolsUsed.push('read_chat_messages');
          appLogger.tool('TOOL', 'Executing read_chat_messages', { query: voiceQuery });
          const userNotes = this.messages.filter((m) => m.role === 'user' && m.id !== userMsg.id).map((m) => m.content);
          const lastNote = userNotes.length > 0 ? userNotes[userNotes.length - 1] : '';

          if (!lastNote) {
            chatReply = 'I checked the chat, but there are no prior text notes posted yet. You can type any architectural specification into the chat notes box.';
            badges.push('💬 Chat Reader');
          } else {
            const wantsDraw = lowerQuery.includes('draw') || lowerQuery.includes('design') || lowerQuery.includes('generate') || lowerQuery.includes('render');

            if (wantsDraw) {
              toolsUsed.push('delegate_to_groq_text_subagent', 'delegate_to_mistral_diagram_subagent');
              const targetPrompt = `Based on user note: ${lastNote}. ${voiceQuery}`;

              appLogger.info('SUBAGENTS', `Dispatching Groq (Text) + Diagram Generator for note: "${lastNote.substring(0, 40)}..."`);

              const textTask = (async () => {
                if (this.config.groqApiKey?.trim()) {
                  return await generateTextExplanationWithGroq(
                    targetPrompt,
                    this.config.groqApiKey,
                    this.config.groqModel || 'llama-3.3-70b-versatile',
                    canvasTopology.topologyGraphText
                  );
                }
                if (this.config.geminiApiKey?.trim()) {
                  const res = await generateDiagramFromPrompt(
                    `Explain architecture for: ${targetPrompt}`,
                    this.config.geminiApiKey,
                    this.config.geminiModel || 'gemini-2.5-flash',
                    rawLibraryItems
                  );
                  return res.chatReply;
                }
                return `Here is the architecture based on your note: ${lastNote}`;
              })();

              const diagramTask = (async () => {
                if (this.config.mistralApiKey?.trim()) {
                  try {
                    return await generateDiagramElementsWithMistral(
                      targetPrompt,
                      this.config.mistralApiKey,
                      this.config.mistralModel || 'mistral-small-latest',
                      rawLibraryItems,
                      canvasTopology.topologyGraphText
                    );
                  } catch (err: any) {
                    appLogger.warn('MISTRAL', `Mistral diagram fallback to Gemini: ${err.message}`);
                  }
                }
                if (this.config.geminiApiKey?.trim()) {
                  const res = await generateDiagramFromPrompt(
                    `explain with diagram, ${targetPrompt}`,
                    this.config.geminiApiKey,
                    this.config.geminiModel || 'gemini-2.5-flash',
                    rawLibraryItems
                  );
                  return res.elements || [];
                }
                return [];
              })();

              const [textResult, diagramResult] = await Promise.all([textTask, diagramTask]);
              chatReply = `I read your note: "${lastNote}". Here is the system architecture:\n\n${textResult}`;
              elements = diagramResult;

              if (executionContext.setCanvasElements && elements.length > 0) {
                executionContext.setCanvasElements(elements);
              }

              badges.push('💬 Chat Note Synthesis');
            } else {
              chatReply = `I read your recent notes from the chat:\n\n"${lastNote}"\n\nWould you like me to draw the architecture diagram for this?`;
              badges.push('💬 Chat Reader');
            }
          }
        } else if (isCanvasQuestion) {
          toolsUsed.push('inspect_canvas_topology');
          appLogger.tool('TOOL', 'Executing inspect_canvas_topology', {});
          if (canvasTopology.nodeCount === 0) {
            chatReply = 'The canvas is currently empty. You can ask me to draw any distributed system or software architecture.';
          } else {
            chatReply = `CURRENT CANVAS BREAKDOWN:\n\n• Components (${canvasTopology.nodeCount}): ${canvasTopology.nodes.map(n => n.label).join(', ')}\n• Connections (${canvasTopology.connectorCount}):\n${canvasTopology.topologyGraphText}`;
          }
          badges.push('🔍 Canvas Inspector');
        } else if (isModification) {
          toolsUsed.push('modify_canvas_node');
          appLogger.tool('TOOL', 'Executing modify_canvas_node', { query: voiceQuery });
          let elms: any[] = [];
          if (this.config.mistralApiKey?.trim()) {
            try {
              elms = await generateDiagramElementsWithMistral(
                voiceQuery,
                this.config.mistralApiKey,
                this.config.mistralModel || 'mistral-small-latest',
                rawLibraryItems,
                canvasTopology.topologyGraphText
              );
            } catch (err: any) {
              appLogger.warn('MISTRAL', `Mistral modification fallback: ${err.message}`);
            }
          }
          if (elms.length === 0 && this.config.geminiApiKey?.trim()) {
            const res = await generateDiagramFromPrompt(
              `Update existing canvas based on: ${voiceQuery}`,
              this.config.geminiApiKey,
              this.config.geminiModel || 'gemini-2.5-flash',
              rawLibraryItems
            );
            elms = res.elements || [];
          }
          elements = elms;

          if (executionContext.setCanvasElements && elements.length > 0) {
            executionContext.setCanvasElements(elements);
          }

          chatReply = `Applied delta modifications to canvas for: ${voiceQuery}`;
          badges.push('✏️ Delta Editor');
        } else {
          toolsUsed.push('delegate_to_groq_text_subagent', 'delegate_to_mistral_diagram_subagent');
          appLogger.info('SUBAGENTS', `Dispatching Groq (Text: ${this.config.groqModel || 'groq/compound'}) + Diagram Subagent`);

          const textTask = (async () => {
            const t0 = Date.now();
            if (this.config.groqApiKey?.trim()) {
              this.callbacks.onSubagentActivity?.({
                subagentName: '⚡ Groq Text Subagent',
                status: 'running',
                message: `Synthesizing architectural text via Groq (${this.config.groqModel || 'groq/compound'})...`
              });
              try {
                const reply = await generateTextExplanationWithGroq(
                  voiceQuery,
                  this.config.groqApiKey,
                  this.config.groqModel || 'groq/compound',
                  canvasTopology.topologyGraphText
                );
                appLogger.info('GROQ', `⚡ Groq Text synthesized in ${Date.now() - t0}ms`);
                return reply;
              } catch (err: any) {
                appLogger.warn('GROQ', `Groq failed (${err.message}), falling back to Gemini`);
              }
            }

            if (this.config.geminiApiKey?.trim()) {
              const res = await generateDiagramFromPrompt(
                `Explain architecture for: ${voiceQuery}`,
                this.config.geminiApiKey,
                this.config.geminiModel || 'gemini-2.5-flash',
                rawLibraryItems
              );
              appLogger.info('GEMINI', `Gemini text in ${Date.now() - t0}ms`);
              return res.chatReply;
            }

            return `Architectural breakdown for: ${voiceQuery}`;
          })();

          const diagramTask = (async () => {
            const t0 = Date.now();
            if (this.config.mistralApiKey?.trim()) {
              try {
                this.callbacks.onSubagentActivity?.({
                  subagentName: '🦔 Mistral Diagram Subagent',
                  status: 'running',
                  message: `Synthesizing vector elements via Mistral (${this.config.mistralModel || 'mistral-small-latest'})...`
                });
                const elms = await generateDiagramElementsWithMistral(
                  voiceQuery,
                  this.config.mistralApiKey,
                  this.config.mistralModel || 'mistral-small-latest',
                  rawLibraryItems,
                  canvasTopology.topologyGraphText
                );
                if (elms && elms.length > 0) {
                  appLogger.info('MISTRAL', `🦔 Mistral synthesized ${elms.length} vector elements in ${Date.now() - t0}ms`);
                  return elms;
                }
              } catch (err: any) {
                appLogger.warn('MISTRAL', `Mistral error (${err.message}), smoothly falling back to Gemini Flash Diagram Generator`);
              }
            }

            if (this.config.geminiApiKey?.trim()) {
              // Fallback to Gemini Flash Diagram Generator
              const res = await generateDiagramFromPrompt(
                `explain with diagram, ${voiceQuery}`,
                this.config.geminiApiKey,
                this.config.geminiModel || 'gemini-2.5-flash',
                rawLibraryItems
              );
              appLogger.info('GEMINI', `✨ Gemini Flash Diagram Generator created ${res.elements?.length || 0} elements in ${Date.now() - t0}ms`);
              return res.elements || [];
            }

            return [];
          })();

          const [textResult, diagramResult] = await Promise.all([textTask, diagramTask]);
          chatReply = textResult;
          elements = diagramResult;

          if (executionContext.setCanvasElements && elements.length > 0) {
            executionContext.setCanvasElements(elements);
          }

          if (this.config.groqApiKey?.trim()) {
            badges.push(`⚡ Groq`);
          }
          if (this.config.mistralApiKey?.trim()) {
            badges.push(`🦔 Mistral`);
          }
          if (!this.config.groqApiKey?.trim() && !this.config.mistralApiKey?.trim() && this.config.geminiApiKey?.trim()) {
            badges.push(`✨ Gemini`);
          }
        }

        const subagentBadge = badges.length > 0 ? badges.join(' + ') : '🎙️ Live Agent';

        const assistantMsg: AdkAgentMessage = {
          id: `msg_${Date.now()}_a`,
          role: 'assistant',
          content: chatReply,
          subagentUsed: subagentBadge,
          toolCalls: toolsUsed.map((t) => ({ name: t, args: { voiceQuery } })),
          timestamp: Date.now()
        };
        this.messages.push(assistantMsg);

        this.callbacks.onTranscript?.(chatReply, true, 'agent');
        if (elements.length > 0) {
          this.callbacks.onDiagramGenerated?.({ chatReply, elements });
        }

        const shouldSpeak = this.isVoiceSessionActive || options.isVoiceInput;
        if (shouldSpeak) {
          appLogger.info('AUDIO', `🔊 Starting speech output (Voice Session: ${this.isVoiceSessionActive})`);
          speakNativeAudioResponse(
            '',
            chatReply,
            this.config.geminiApiKey,
            this.config.geminiModel || 'gemini-2.5-flash',
            () => this.setState('speaking'),
            () => this.setState('idle'),
            (err) => {
              appLogger.warn('AUDIO', `Audio notice: ${err}`);
              this.setState('idle');
            },
            false,
            this.config.studioVoice || 'Puck'
          );
        } else {
          this.setState('idle');
        }

        return {
          chatReply,
          elements,
          subagentBadge,
          toolsUsed,
          isVoiceReply: Boolean(shouldSpeak)
        };

      } catch (err: any) {
        appLogger.error('ORCHESTRATOR', `Execution failed: ${err.message}`, err);
        this.setState('error');
        this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
        throw err;
      }
    });
  }

  public resetSession(newSessionId: string): void {
    appLogger.info('SESSION', `Resetting session memory for new ID: ${newSessionId}`);
    stopAudioResponse();
    this.config.sessionId = newSessionId;
    this.messages = [];
    this.setState('idle');
  }

  public destroy(): void {
    appLogger.info('SESSION', `Destroying Live Agent instance: ${this.config.sessionId}`);
    stopAudioResponse();
    this.isVoiceSessionActive = false;
    this.messages = [];
    this.tools.clear();
  }
}
