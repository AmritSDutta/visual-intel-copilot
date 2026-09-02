import { generateDiagramWithGroq } from './groqService';
import type { AIDiagramResult, AdkToolExecutionContext, SubagentActivityEvent } from '../core/types';

export interface GroqSubagentTask {
  prompt: string;
  groqApiKey: string;
  model?: string;
  rawLibraryItems?: any[];
  context?: AdkToolExecutionContext;
}

export async function runGroqDiagramSubagent(
  task: GroqSubagentTask,
  onActivity?: (event: SubagentActivityEvent) => void
): Promise<AIDiagramResult> {
  const startTime = Date.now();
  const subagentName = '⚡ Groq LPU Diagram Subagent';
  const targetModel = task.model || 'groq/compound';

  onActivity?.({
    subagentName,
    status: 'running',
    message: `Synthesizing architecture via ${targetModel}...`
  });

  try {
    const result = await generateDiagramWithGroq(
      task.prompt,
      task.groqApiKey,
      targetModel,
      task.rawLibraryItems || []
    );

    const durationMs = Date.now() - startTime;

    if (task.context?.setCanvasElements && result.elements?.length) {
      task.context.setCanvasElements(result.elements);
    }

    onActivity?.({
      subagentName,
      status: 'completed',
      message: `Rendered ${result.elements.length} vector elements in ${durationMs}ms`,
      durationMs
    });

    return result;
  } catch (err: any) {
    onActivity?.({
      subagentName,
      status: 'failed',
      message: err?.message || 'Subagent execution failed'
    });
    throw err;
  }
}
