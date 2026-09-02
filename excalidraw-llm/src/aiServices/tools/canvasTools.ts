import type { AdkTool, AdkToolExecutionContext, AdkAgentMessage } from '../core/types';

export interface CanvasNodeInfo {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor?: string;
  backgroundColor?: string;
}

export interface CanvasConnectionInfo {
  id: string;
  fromId: string;
  fromLabel: string;
  toId: string;
  toLabel: string;
  label?: string;
}

export interface CanvasTopologySummary {
  nodeCount: number;
  connectorCount: number;
  nodes: CanvasNodeInfo[];
  connections: CanvasConnectionInfo[];
  topologyGraphText: string;
}

/**
 * Extracts structured node details, arrow bindings, and ASCII graph topology from raw Excalidraw elements.
 */
export function extractCanvasTopology(elements: any[]): CanvasTopologySummary {
  if (!Array.isArray(elements) || elements.length === 0) {
    return {
      nodeCount: 0,
      connectorCount: 0,
      nodes: [],
      connections: [],
      topologyGraphText: 'Canvas is currently empty.'
    };
  }

  const nodeMap = new Map<string, CanvasNodeInfo>();
  const nodes: CanvasNodeInfo[] = [];
  const connections: CanvasConnectionInfo[] = [];

  // Pass 1: Extract Shape Nodes
  for (const el of elements) {
    if (!el || el.isDeleted) continue;

    if (el.type !== 'arrow' && el.type !== 'line') {
      let labelText = '';
      if (typeof el.text === 'string' && el.text.trim()) {
        labelText = el.text.trim();
      } else if (typeof el.label === 'string' && el.label.trim()) {
        labelText = el.label.trim();
      } else if (el.label && typeof el.label.text === 'string' && el.label.text.trim()) {
        labelText = el.label.text.trim();
      } else {
        labelText = `${el.type}_${el.id ? el.id.substring(0, 5) : 'node'}`;
      }

      const nodeInfo: CanvasNodeInfo = {
        id: el.id || `node_${nodes.length + 1}`,
        label: labelText,
        type: el.type,
        x: Math.round(el.x || 0),
        y: Math.round(el.y || 0),
        width: Math.round(el.width || 100),
        height: Math.round(el.height || 60),
        strokeColor: el.strokeColor,
        backgroundColor: el.backgroundColor
      };

      nodeMap.set(nodeInfo.id, nodeInfo);
      nodes.push(nodeInfo);
    }
  }

  // Pass 2: Extract Arrow / Connector Bindings
  for (const el of elements) {
    if (!el || el.isDeleted) continue;

    if (el.type === 'arrow' || el.type === 'line') {
      const startId = el.startBinding?.elementId || el.start?.id;
      const endId = el.endBinding?.elementId || el.end?.id;

      const fromNode = startId ? nodeMap.get(startId) : undefined;
      const toNode = endId ? nodeMap.get(endId) : undefined;

      let arrowLabel = '';
      if (typeof el.text === 'string' && el.text.trim()) {
        arrowLabel = el.text.trim();
      } else if (el.label && typeof el.label.text === 'string') {
        arrowLabel = el.label.text.trim();
      }

      connections.push({
        id: el.id || `arrow_${connections.length + 1}`,
        fromId: startId || 'unknown_start',
        fromLabel: fromNode?.label || (startId ? `Node(${startId})` : 'Ingress/Source'),
        toId: endId || 'unknown_end',
        toLabel: toNode?.label || (endId ? `Node(${endId})` : 'Egress/Target'),
        label: arrowLabel || undefined
      });
    }
  }

  // Pass 3: Build Graph String
  const graphLines: string[] = [];
  if (connections.length > 0) {
    connections.forEach((c, idx) => {
      const edge = c.label ? ` --[${c.label}]--> ` : ' --> ';
      graphLines.push(`${idx + 1}. [${c.fromLabel}]${edge}[${c.toLabel}]`);
    });
  } else if (nodes.length > 0) {
    nodes.forEach((n, idx) => {
      graphLines.push(`${idx + 1}. [${n.label}] (${n.type}) at (${n.x}, ${n.y})`);
    });
  }

  return {
    nodeCount: nodes.length,
    connectorCount: connections.length,
    nodes,
    connections,
    topologyGraphText: graphLines.length > 0 ? graphLines.join('\n') : 'No connected components detected.'
  };
}

/**
 * Creates the full perception, manipulation, and chat reading tools for Live Agent.
 */
export function createCanvasTools(getMessages?: () => AdkAgentMessage[]): AdkTool[] {
  const tools: AdkTool[] = [
    {
      name: 'read_chat_messages',
      description: 'Reads the user notes, text specifications, and recent conversation history posted in the chat session.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Number of recent messages to return (default 10).'
          }
        }
      },
      execute: async (args: Record<string, any>) => {
        const msgs = getMessages ? getMessages() : [];
        const limit = typeof args.limit === 'number' ? args.limit : 10;
        const recent = msgs.slice(-limit);

        const userNotes = recent.filter((m) => m.role === 'user').map((m) => m.content);

        return {
          status: 'success',
          totalMessages: msgs.length,
          recentUserNotes: userNotes,
          latestUserNote: userNotes.length > 0 ? userNotes[userNotes.length - 1] : 'No notes found in chat.',
          messages: recent.map((m) => ({
            role: m.role,
            content: m.content,
            badge: m.subagentUsed
          }))
        };
      }
    },
    {
      name: 'inspect_canvas_topology',
      description: 'Inspects and reads the complete architectural topology of the active Excalidraw canvas, returning structured nodes, shapes, connectors, protocols, and ASCII graph.',
      parameters: {
        type: 'object',
        properties: {}
      },
      execute: async (_args: Record<string, any>, context: AdkToolExecutionContext) => {
        const elements = context.getCanvasElements ? context.getCanvasElements() : [];
        const topology = extractCanvasTopology(elements);
        return {
          status: 'success',
          summary: `${topology.nodeCount} nodes, ${topology.connectorCount} connectors on canvas.`,
          topologyGraph: topology.topologyGraphText,
          nodes: topology.nodes,
          connections: topology.connections
        };
      }
    },
    {
      name: 'get_canvas_visual_snapshot',
      description: 'Captures a high-resolution base64 PNG visual snapshot of the canvas for multimodal image analysis.',
      parameters: {
        type: 'object',
        properties: {}
      },
      execute: async (_args: Record<string, any>, context: AdkToolExecutionContext) => {
        if (!context.getCanvasSnapshotBase64) {
          return { error: 'Snapshot capture not available in current execution context' };
        }
        const snapshot = await context.getCanvasSnapshotBase64();
        if (!snapshot) {
          return { status: 'empty', message: 'Canvas is currently blank, no visual snapshot generated.' };
        }
        return {
          status: 'success',
          hasImage: true,
          imageLength: snapshot.length,
          previewUrl: snapshot.substring(0, 80) + '...'
        };
      }
    },
    {
      name: 'find_canvas_nodes',
      description: 'Searches for components on the canvas by keyword or label (e.g. "database", "gateway", "cache").',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search term or node name to look for on the canvas.'
          }
        },
        required: ['query']
      },
      execute: async (args: Record<string, any>, context: AdkToolExecutionContext) => {
        const elements = context.getCanvasElements ? context.getCanvasElements() : [];
        const topology = extractCanvasTopology(elements);
        const query = String(args.query || '').toLowerCase().trim();

        const matches = topology.nodes.filter((n) =>
          n.label.toLowerCase().includes(query) || n.type.toLowerCase().includes(query) || n.id.toLowerCase().includes(query)
        );

        return {
          query,
          matchCount: matches.length,
          nodes: matches
        };
      }
    },
    {
      name: 'modify_canvas_node',
      description: 'Performs a targeted modification on an existing canvas node (rename label, update colors, or change coordinates) without clearing the canvas.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: {
            type: 'string',
            description: 'The unique ID or label of the node to modify.'
          },
          newLabel: {
            type: 'string',
            description: 'The new label or text for the node.'
          },
          strokeColor: {
            type: 'string',
            description: 'Optional new border color (hex code).'
          },
          backgroundColor: {
            type: 'string',
            description: 'Optional new background fill color (hex code).'
          }
        },
        required: ['nodeId']
      },
      execute: async (args: Record<string, any>, context: AdkToolExecutionContext) => {
        const elements = context.getCanvasElements ? context.getCanvasElements() : [];
        if (!elements.length || !context.setCanvasElements) {
          return { error: 'No canvas elements found to modify' };
        }

        const targetId = String(args.nodeId).toLowerCase();
        let modified = false;

        const updatedElements = elements.map((el: any) => {
          const matchesId = el.id && el.id.toLowerCase() === targetId;
          const matchesText = (typeof el.text === 'string' && el.text.toLowerCase().includes(targetId)) ||
                              (el.label && typeof el.label.text === 'string' && el.label.text.toLowerCase().includes(targetId));

          if (matchesId || matchesText) {
            modified = true;
            const updated = { ...el };
            if (args.newLabel) {
              if (updated.type === 'text') updated.text = args.newLabel;
              if (updated.label) updated.label = { ...updated.label, text: args.newLabel };
            }
            if (args.strokeColor) updated.strokeColor = args.strokeColor;
            if (args.backgroundColor) updated.backgroundColor = args.backgroundColor;
            updated.version = (updated.version || 1) + 1;
            return updated;
          }
          return el;
        });

        if (modified) {
          context.setCanvasElements(updatedElements);
          return { status: 'success', message: `Updated node matching '${args.nodeId}'` };
        }

        return { status: 'not_found', message: `No node found matching '${args.nodeId}'` };
      }
    },
    {
      name: 'append_canvas_elements',
      description: 'Appends new shapes or connector arrows into the active canvas without removing existing elements.',
      parameters: {
        type: 'object',
        properties: {
          elements: {
            type: 'string',
            description: 'JSON string of new elements array to append.'
          }
        },
        required: ['elements']
      },
      execute: async (args: Record<string, any>, context: AdkToolExecutionContext) => {
        const existing = context.getCanvasElements ? context.getCanvasElements() : [];
        if (!context.setCanvasElements) {
          return { error: 'Canvas update not supported in current context' };
        }

        try {
          const newElements = typeof args.elements === 'string' ? JSON.parse(args.elements) : args.elements;
          if (Array.isArray(newElements)) {
            context.setCanvasElements([...existing, ...newElements]);
            return { status: 'success', appendedCount: newElements.length, totalCount: existing.length + newElements.length };
          }
          return { error: 'Elements parameter must be an array' };
        } catch (e: any) {
          return { error: `Failed to parse elements JSON: ${e.message}` };
        }
      }
    },
    {
      name: 'clear_canvas',
      description: 'Resets and clears all elements from the active canvas scene.',
      parameters: {
        type: 'object',
        properties: {}
      },
      execute: async (_args: Record<string, any>, context: AdkToolExecutionContext) => {
        if (context.setCanvasElements) {
          context.setCanvasElements([]);
        }
        return { status: 'cleared', message: 'Canvas has been reset.' };
      }
    }
  ];

  return tools;
}
