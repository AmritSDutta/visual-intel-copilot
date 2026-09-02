export interface CanvasNodeSummary {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  connectedTo: string[];
}

export interface CanvasTopology {
  nodes: CanvasNodeSummary[];
  connectors: Array<{
    id: string;
    fromNodeId?: string;
    toNodeId?: string;
    label?: string;
  }>;
  nodeCount: number;
  connectorCount: number;
  topologyGraphText: string;
}

export interface AdkToolExecutionContext {
  sessionId?: string;
  getCanvasElements?: () => unknown[];
  getCanvasSnapshotBase64?: () => Promise<string | null>;
  setCanvasElements?: (elements: unknown[]) => void;
  rawLibraryItems?: unknown[];
  onSubagentProgress?: (event: SubagentActivityEvent) => void;
}

export interface AdkTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  execute: (args: Record<string, any>, context: AdkToolExecutionContext) => Promise<any>;
}

export type AdkAgentRole = 'user' | 'assistant' | 'system';
export type AdkAgentState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface AdkAgentMessage {
  id: string;
  role: AdkAgentRole;
  content: string;
  timestamp: number;
  subagentUsed?: string;
  toolCalls?: Array<{
    name: string;
    args: Record<string, any>;
    result?: any;
  }>;
}

export interface SubagentActivityEvent {
  subagentName: string;
  status: 'running' | 'completed' | 'failed';
  message: string;
  durationMs?: number;
}

export interface AIDiagramResult {
  chatReply: string;
  elements: any[];
}

export interface AdkExecutionResult {
  chatReply: string;
  elements: any[];
  subagentBadge: string;
  toolsUsed: string[];
  isVoiceReply: boolean;
}

export interface AdkLiveAgentConfig {
  sessionId: string;
  geminiApiKey: string;
  groqApiKey?: string;
  mistralApiKey?: string;
  geminiModel?: string;
  groqModel?: string;
  mistralModel?: string;
  studioVoice?: string;
  rawLibraryItems?: unknown[];
  browserSpeechFallback?: boolean;
  context?: AdkToolExecutionContext;
}

export interface AdkAgentCallbacks {
  onStateChange?: (state: AdkAgentState) => void;
  onTranscript?: (text: string, isFinal: boolean, speaker: 'user' | 'agent') => void;
  onDiagramGenerated?: (result: AIDiagramResult) => void;
  onSubagentActivity?: (event: SubagentActivityEvent) => void;
  onAudioLevel?: (level: number) => void;
  onError?: (error: Error) => void;
}

export interface ModelOption {
  id: string;
  label: string;
}

export const GROQ_MODELS: ModelOption[] = [
  { id: 'groq/compound', label: '⚡ Groq Compound (Default ⭐)' },
  { id: 'groq/compound-mini', label: '⚡ Groq Compound Mini' },
  { id: 'qwen/qwen3.8-27b', label: '⚡ Qwen 3.8 27B' },
  { id: 'openai/gpt-oss-120b', label: '⚡ GPT OSS 120B' }
];

export const MISTRAL_MODELS: ModelOption[] = [
  { id: 'mistral-small-latest', label: '🦔 Mistral Small (Recommended ⭐ - Spatial Reasoning)' },
  { id: 'open-mistral-nemo', label: '🦔 Mistral Nemo (12B Fast)' },
  { id: 'open-mistral-7b', label: '🦔 Mistral 7B (Free Tier Instant)' },
  { id: 'codestral-latest', label: '🦔 Codestral (Code & Vector Specialist)' },
  { id: 'mistral-large-latest', label: '🦔 Mistral Large (Complex Systems)' }
];
