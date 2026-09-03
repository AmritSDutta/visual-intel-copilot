import type { AdkTool, AdkAgentMessage } from './types';
import {
  extractCanvasTopology,
  webMcpTools,
  type CanvasNodeInfo,
  type CanvasConnectionInfo,
  type CanvasTopologySummary
} from '../services/webMcpService';

export {
  extractCanvasTopology,
  type CanvasNodeInfo,
  type CanvasConnectionInfo,
  type CanvasTopologySummary
};

/**
 * Creates the full perception, manipulation, and chat reading tools for Live Agent.
 * Leverages the unified WebMCP tool definitions from webMcpService.ts.
 */
export function createCanvasTools(_getMessages?: () => AdkAgentMessage[]): AdkTool[] {
  return webMcpTools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: {
      type: 'object',
      properties: t.inputSchema.properties || {},
      required: (t.inputSchema.required as string[]) || []
    },
    execute: async (args: Record<string, any>) => {
      return await t.execute(args);
    }
  }));
}
