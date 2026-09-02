import type { AdkTool, AdkToolExecutionContext, AdkAgentMessage } from '../core/types';
import { createCanvasTools } from './canvasTools';
import { generateTextExplanationWithGroq } from '../llmServices/groqService';
import { generateDiagramElementsWithMistral } from '../llmServices/mistralService';
import { generateDiagramFromPrompt } from '../llmServices/geminiService';

export interface MultiAgentToolsConfig {
  geminiApiKey: string;
  groqApiKey?: string;
  mistralApiKey?: string;
  groqModel?: string;
  mistralModel?: string;
  geminiModel?: string;
  getMessages?: () => AdkAgentMessage[];
}

export function createMultiAgentTools(config: MultiAgentToolsConfig): AdkTool[] {
  // 1. All Canvas Perception, Manipulation, and Chat Reading Tools
  const canvasTools = createCanvasTools(config.getMessages);

  // 2. Subagent Delegation Tools Owned by Live Agent
  const subagentTools: AdkTool[] = [
    {
      name: 'delegate_to_groq_text_subagent',
      description: 'Invokes Groq LPU Subagent to generate an ultra-fast, structured plain-text architectural breakdown (~300ms).',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'The architecture or system design prompt.' },
          canvasTopology: { type: 'string', description: 'Optional context about active canvas elements.' }
        },
        required: ['prompt']
      },
      execute: async (args: Record<string, any>, context: AdkToolExecutionContext) => {
        if (!config.groqApiKey?.trim()) {
          const res = await generateDiagramFromPrompt(
            `Explain architecture for: ${args.prompt}`,
            config.geminiApiKey,
            config.geminiModel || 'gemini-2.5-flash',
            context.rawLibraryItems || []
          );
          return { chatReply: res.chatReply };
        }

        context.onSubagentProgress?.({
          subagentName: '⚡ Groq Text Subagent',
          status: 'running',
          message: `Generating architectural breakdown via Groq (${config.groqModel || 'groq/compound'})...`
        });

        const chatReply = await generateTextExplanationWithGroq(
          args.prompt,
          config.groqApiKey,
          config.groqModel || 'groq/compound',
          args.canvasTopology
        );

        return { chatReply };
      }
    },
    {
      name: 'delegate_to_mistral_diagram_subagent',
      description: 'Invokes Mistral AI Subagent to synthesize spatial Excalidraw vector elements (shapes, arrows, library stencils).',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'The diagram requirements to synthesize.' },
          canvasTopology: { type: 'string', description: 'Optional context of existing canvas nodes.' }
        },
        required: ['prompt']
      },
      execute: async (args: Record<string, any>, context: AdkToolExecutionContext) => {
        const rawLibraryItems = context.rawLibraryItems || [];

        if (!config.mistralApiKey?.trim()) {
          const res = await generateDiagramFromPrompt(
            `explain with diagram, ${args.prompt}`,
            config.geminiApiKey,
            config.geminiModel || 'gemini-2.5-flash',
            rawLibraryItems
          );
          if (context.setCanvasElements && res.elements?.length) {
            context.setCanvasElements(res.elements);
          }
          return { elements: res.elements || [] };
        }

        context.onSubagentProgress?.({
          subagentName: '🦔 Mistral Diagram Subagent',
          status: 'running',
          message: `Synthesizing Excalidraw diagram elements via Mistral (${config.mistralModel || 'mistral-small-latest'})...`
        });

        const elements = await generateDiagramElementsWithMistral(
          args.prompt,
          config.mistralApiKey,
          config.mistralModel || 'mistral-small-latest',
          rawLibraryItems,
          args.canvasTopology
        );

        if (context.setCanvasElements && elements.length > 0) {
          context.setCanvasElements(elements);
        }

        return { elements };
      }
    }
  ];

  return [...canvasTools, ...subagentTools];
}
