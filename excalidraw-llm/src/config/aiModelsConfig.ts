/**
 * ============================================================================
 * SINGLE SOURCE OF TRUTH: AI MODELS & TASK REGISTRY CONFIGURATION
 * ============================================================================
 */

export const AI_TASKS = {
  CANVAS_MAIN_AGENT: 'CANVAS_MAIN_AGENT',
  CANVAS_DIAGRAM_ENGINE: 'CANVAS_DIAGRAM_ENGINE',
  VOICE_LIVE_AGENT: 'VOICE_LIVE_AGENT',
  OLLAMA_CHAT: 'OLLAMA_CHAT'
} as const;

export type AiTaskId = (typeof AI_TASKS)[keyof typeof AI_TASKS];

export interface TaskModelConfig {
  task: AiTaskId;
  displayName: string;
  primaryModel: string;
  fallbackModels: string[];
  temperature: number;
  maxOutputTokens: number;
}

export const TASK_MODEL_REGISTRY: Record<AiTaskId, TaskModelConfig> = {
  CANVAS_MAIN_AGENT: {
    task: AI_TASKS.CANVAS_MAIN_AGENT,
    displayName: 'Canvas Main Orchestrator Agent',
    primaryModel: 'gemini-3.5-flash-lite',
    fallbackModels: ['gemini-3.1-flash-lite'],
    temperature: 0.2,
    maxOutputTokens: 8192
  },
  CANVAS_DIAGRAM_ENGINE: {
    task: AI_TASKS.CANVAS_DIAGRAM_ENGINE,
    displayName: 'Canvas Vector Diagram Subagent',
    primaryModel: 'gemini-3.5-flash-lite',
    fallbackModels: ['gemini-3.1-flash-lite'],
    temperature: 0.2,
    maxOutputTokens: 8192
  },
  VOICE_LIVE_AGENT: {
    task: AI_TASKS.VOICE_LIVE_AGENT,
    displayName: 'Voice Live Audio Specialist',
    primaryModel: 'gemini-2.5-flash-native-audio-preview-12-2025',
    fallbackModels: ['gemini-3.1-flash-live-preview'],
    temperature: 0.3,
    maxOutputTokens: 4096
  },
  OLLAMA_CHAT: {
    task: AI_TASKS.OLLAMA_CHAT,
    displayName: 'Ollama Cloud & Local Inference',
    primaryModel: 'gemma4:31b-cloud',
    fallbackModels: [],
    temperature: 0.2,
    maxOutputTokens: 8192
  }
};

/** UI Model Option Interface */
export interface UiModelOption {
  id: string;
  label: string;
  isDefault?: boolean;
}

/** UI Dropdown Options for Canvas Tab (Settings Modal) */
export const CANVAS_GEMINI_MODEL_OPTIONS: UiModelOption[] = [
  { id: 'gemini-3.5-flash-lite', label: 'gemini-3.5-flash-lite (Primary / Fast ⚡)', isDefault: true },
  { id: 'gemini-3.1-flash-lite', label: 'gemini-3.1-flash-lite (Fast Fallback 🚀)' },
  { id: 'gemma-4-31b-it', label: 'gemma-4-31b-it (Gemma 4 31B Instruct)' },
  { id: 'gemma-4-26b-it', label: 'gemma-4-26b-it (Gemma 4 26B Instruct)' }
];

/** UI Dropdown Options for Voice Tab (Gemini Live API) */
export const VOICE_LIVE_MODEL_OPTIONS: UiModelOption[] = [
  {
    id: 'gemini-2.5-flash-native-audio-preview-12-2025',
    label: 'gemini-2.5-flash-native-audio-preview-12-2025 (Native Audio ⭐)',
    isDefault: true
  },
  {
    id: 'gemini-3.1-flash-live-preview',
    label: 'gemini-3.1-flash-live-preview (Live Preview)'
  }
];

/** Ollama Model Presets (Extensible for custom models) */
export const OLLAMA_MODEL_PRESETS: UiModelOption[] = [
  { id: 'gemma4:31b-cloud', label: 'gemma4:31b-cloud (Gemma 4 31B Cloud)', isDefault: true },
  { id: 'gpt-oss:120b', label: 'gpt oss 120b', isDefault: false},
  { id: 'nemotron-3-super', label: 'nemotron 3 super', isDefault: false},
];

/**
 * Resolves candidate model sequence for a given task.
 * Prepend user's custom preference if provided, then fallback to task defaults.
 */
export function getCandidateModelsForTask(taskId: AiTaskId, preferredModel?: string): string[] {
  const config = TASK_MODEL_REGISTRY[taskId];
  const userSelected = (preferredModel || '').trim();

  // If user passed a native-audio model on canvas or invalid model, normalize to primary
  const primary = userSelected && !userSelected.includes('native-audio')
    ? userSelected
    : config.primaryModel;

  const models = [primary, ...config.fallbackModels];
  return Array.from(new Set(models));
}
