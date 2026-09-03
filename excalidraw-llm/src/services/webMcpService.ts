import { convertToExcalidrawElements } from '@excalidraw/excalidraw';
import { normalizeLinearElement, sanitizeSkeletonsForExcalidraw } from '../utils/libraryIndexer';

// Global augmentation for the browser Model Context API / WebMCP spec
declare global {
  interface ModelContextToolSchema {
    type: 'object';
    properties?: Record<string, any>;
    required?: readonly string[] | string[];
    description?: string;
  }

  interface WebMcpTool {
    readonly name: string;
    readonly description: string;
    readonly inputSchema: ModelContextToolSchema;
    readonly execute: (params?: any) => Promise<any> | any;
    readonly readOnly?: boolean;
  }

  interface ModelContext {
    registerTool: (tool: WebMcpTool) => void | Promise<void>;
    unregisterTool?: (name: string) => void | Promise<void>;
    listTools?: () => Promise<WebMcpTool[]> | WebMcpTool[];
  }

  interface Navigator {
    modelContext?: ModelContext;
  }
}

export type { WebMcpTool };

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

export interface ActiveCanvasBridge {
  getElements: () => any[];
  setElements: (elements: any[]) => void;
  getSnapshotBase64?: () => Promise<string | null>;
  getChatMessages?: () => Array<{ role: string; content: string; badge?: string }>;
}

let activeCanvasBridge: ActiveCanvasBridge | null = null;

/**
 * Registers the active workspace's canvas bridge. Returns an unregister cleanup function.
 */
export function registerActiveCanvasBridge(bridge: ActiveCanvasBridge): () => void {
  activeCanvasBridge = bridge;
  return () => {
    if (activeCanvasBridge === bridge) {
      activeCanvasBridge = null;
    }
  };
}

export function getActiveCanvasBridge(): ActiveCanvasBridge | null {
  return activeCanvasBridge;
}

/**
 * Sends a log entry to the backend Vite dev server / Cloudflare middleware (/api/log)
 * which writes directly to the stdio terminal console.
 */
export function logToStdio(tag: string, message: string, details?: any) {
  if (typeof window !== 'undefined') {
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level: 'TOOL',
        tag: tag || 'WEBMCP',
        message,
        details
      })
    }).catch(() => {});
  }
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

// ── 1. Read-Only System Tools ──────────────────────────────────────────

export const getCurrentIstDateTool: WebMcpTool = {
  name: 'get_current_ist_date',
  description: 'Returns the current date and time in Indian Standard Time (IST).',
  readOnly: true,
  inputSchema: {
    type: 'object',
    properties: {}
  },
  execute: async () => {
    const istString = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'full',
      timeStyle: 'medium'
    });
    logToStdio('WEBMCP', 'Tool "get_current_ist_date" was called!', { ist: istString });
    return { ist: istString };
  }
};

// ── 2. Canvas Perception Tools ─────────────────────────────────────────

export const inspectCanvasTopologyTool: WebMcpTool = {
  name: 'inspect_canvas_topology',
  description: 'Inspects and reads the complete architectural topology of the active Excalidraw canvas, returning structured nodes, shapes, connectors, protocols, and ASCII graph.',
  readOnly: true,
  inputSchema: {
    type: 'object',
    properties: {}
  },
  execute: async () => {
    const elements = activeCanvasBridge?.getElements ? activeCanvasBridge.getElements() : [];
    const topology = extractCanvasTopology(elements);
    logToStdio('WEBMCP', 'Tool "inspect_canvas_topology" was called', { nodeCount: topology.nodeCount, connectorCount: topology.connectorCount });
    return {
      status: 'success',
      summary: `${topology.nodeCount} nodes, ${topology.connectorCount} connectors on canvas.`,
      topologyGraph: topology.topologyGraphText,
      nodes: topology.nodes,
      connections: topology.connections
    };
  }
};

export const findCanvasNodesTool: WebMcpTool = {
  name: 'find_canvas_nodes',
  description: 'Searches for components on the canvas by keyword, name, or role (e.g. "database", "gateway", "cache", "client").',
  readOnly: true,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search term or node name to look for on the canvas.'
      }
    },
    required: ['query']
  },
  execute: async (args: { query?: string }) => {
    const elements = activeCanvasBridge?.getElements ? activeCanvasBridge.getElements() : [];
    const topology = extractCanvasTopology(elements);
    const query = String(args?.query || '').toLowerCase().trim();

    const matches = topology.nodes.filter((n) =>
      n.label.toLowerCase().includes(query) || n.type.toLowerCase().includes(query) || n.id.toLowerCase().includes(query)
    );

    logToStdio('WEBMCP', `Tool "find_canvas_nodes" for query "${query}" found ${matches.length} matches`);
    return {
      query,
      matchCount: matches.length,
      nodes: matches
    };
  }
};

export const getCanvasVisualSnapshotTool: WebMcpTool = {
  name: 'get_canvas_visual_snapshot',
  description: 'Captures a high-resolution base64 PNG visual snapshot of the canvas for multimodal spatial and visual analysis.',
  readOnly: true,
  inputSchema: {
    type: 'object',
    properties: {}
  },
  execute: async () => {
    if (!activeCanvasBridge?.getSnapshotBase64) {
      return { error: 'Snapshot capture not available in current execution context' };
    }
    const snapshot = await activeCanvasBridge.getSnapshotBase64();
    if (!snapshot) {
      return { status: 'empty', message: 'Canvas is currently blank, no visual snapshot generated.' };
    }
    logToStdio('WEBMCP', 'Tool "get_canvas_visual_snapshot" captured canvas image');
    return {
      status: 'success',
      hasImage: true,
      imageLength: snapshot.length,
      previewUrl: snapshot.substring(0, 80) + '...'
    };
  }
};

export const readChatMessagesTool: WebMcpTool = {
  name: 'read_chat_messages',
  description: 'Reads user notes, text specifications, and recent conversation history posted in the chat session.',
  readOnly: true,
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Number of recent messages to return (default 10).'
      }
    }
  },
  execute: async (args: { limit?: number }) => {
    const msgs = activeCanvasBridge?.getChatMessages ? activeCanvasBridge.getChatMessages() : [];
    const limit = typeof args?.limit === 'number' ? args.limit : 10;
    const recent = msgs.slice(-limit);
    const userNotes = recent.filter((m) => m.role === 'user').map((m) => m.content);

    logToStdio('WEBMCP', `Tool "read_chat_messages" read ${recent.length} messages`);
    return {
      status: 'success',
      totalMessages: msgs.length,
      recentUserNotes: userNotes,
      latestUserNote: userNotes.length > 0 ? userNotes[userNotes.length - 1] : 'No notes found in chat.',
      messages: recent
    };
  }
};

// ── 3. In-Place Canvas Manipulation Tools ──────────────────────────────

export const modifyCanvasNodeTool: WebMcpTool = {
  name: 'modify_canvas_node',
  description: 'Performs a targeted in-place modification on an existing canvas node (renaming label, updating border/fill colors, or changing coordinates) without clearing or affecting other elements on the canvas.',
  readOnly: false,
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: {
        type: 'string',
        description: 'The unique ID or text label of the node to modify.'
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
  execute: async (args: { nodeId: string; newLabel?: string; strokeColor?: string; backgroundColor?: string }) => {
    const elements = activeCanvasBridge?.getElements ? activeCanvasBridge.getElements() : [];
    if (!elements.length || !activeCanvasBridge?.setElements) {
      return { error: 'No active canvas elements found to modify' };
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
          if (updated.label) {
            if (typeof updated.label === 'object') {
              updated.label = { ...updated.label, text: args.newLabel };
            } else {
              updated.label = { text: args.newLabel };
            }
          }
        }
        if (args.strokeColor) updated.strokeColor = args.strokeColor;
        if (args.backgroundColor) updated.backgroundColor = args.backgroundColor;
        updated.version = (updated.version || 1) + 1;
        updated.versionNonce = Math.floor(Math.random() * 2000000000);
        return normalizeLinearElement(updated);
      }
      return normalizeLinearElement(el);
    });

    if (modified) {
      activeCanvasBridge.setElements(updatedElements);
      logToStdio('WEBMCP', `Tool "modify_canvas_node" updated node matching '${args.nodeId}'`, args);
      return { status: 'success', message: `Updated node matching '${args.nodeId}' in-place.` };
    }

    return { status: 'not_found', message: `No node found matching '${args.nodeId}'.` };
  }
};

export const appendCanvasElementsTool: WebMcpTool = {
  name: 'append_canvas_elements',
  description: 'Appends new shapes or connector arrows into the active canvas without removing or overwriting existing elements.',
  readOnly: false,
  inputSchema: {
    type: 'object',
    properties: {
      elements: {
        type: 'string',
        description: 'JSON string of new elements array to append.'
      }
    },
    required: ['elements']
  },
  execute: async (args: { elements: any }) => {
    const existing = activeCanvasBridge?.getElements ? activeCanvasBridge.getElements() : [];
    if (!activeCanvasBridge?.setElements) {
      return { error: 'Canvas update not supported in current context' };
    }

    try {
      const rawElements = typeof args.elements === 'string' ? JSON.parse(args.elements) : args.elements;
      if (Array.isArray(rawElements)) {
        const sanitized = sanitizeSkeletonsForExcalidraw(rawElements);
        const converted = convertToExcalidrawElements(sanitized, { regenerateIds: false });
        const allElements = [...existing, ...converted].map(normalizeLinearElement);
        activeCanvasBridge.setElements(allElements);
        logToStdio('WEBMCP', `Tool "append_canvas_elements" appended ${converted.length} elements`, { totalCount: allElements.length });
        return { status: 'success', appendedCount: converted.length, totalCount: allElements.length };
      }
      return { error: 'Elements parameter must be an array' };
    } catch (e: any) {
      return { error: `Failed to parse elements JSON: ${e.message}` };
    }
  }
};

export const clearCanvasTool: WebMcpTool = {
  name: 'clear_canvas',
  description: 'Resets and clears all elements from the active canvas scene.',
  readOnly: false,
  inputSchema: {
    type: 'object',
    properties: {}
  },
  execute: async () => {
    if (activeCanvasBridge?.setElements) {
      activeCanvasBridge.setElements([]);
    }
    logToStdio('WEBMCP', 'Tool "clear_canvas" reset active canvas scene');
    return { status: 'cleared', message: 'Canvas has been reset.' };
  }
};

// ── Registry of all WebMCP tools ───────────────────────────────────────

export const webMcpTools: readonly WebMcpTool[] = [
  getCurrentIstDateTool,
  inspectCanvasTopologyTool,
  findCanvasNodesTool,
  getCanvasVisualSnapshotTool,
  readChatMessagesTool,
  modifyCanvasNodeTool,
  appendCanvasElementsTool,
  clearCanvasTool
];

// Internal set of registered tool names to ensure idempotent registration across tabs/renders
const registeredToolNames = new Set<string>();

/**
 * Check if the browser currently supports navigator.modelContext (WebMCP).
 */
export function isWebMcpSupported(): boolean {
  return typeof navigator !== 'undefined' && 'modelContext' in navigator && !!navigator.modelContext?.registerTool;
}

/**
 * Registers a single tool with navigator.modelContext if available.
 */
export async function registerWebMcpTool(tool: WebMcpTool): Promise<boolean> {
  if (!isWebMcpSupported() || !navigator.modelContext) {
    return false;
  }

  try {
    await navigator.modelContext.registerTool(tool);
    registeredToolNames.add(tool.name);
    logToStdio('WEBMCP', `Registered WebMCP tool: "${tool.name}" on navigator.modelContext`);
    return true;
  } catch (error) {
    logToStdio('WEBMCP', `Failed to register tool "${tool.name}": ${String(error)}`);
    return false;
  }
}

/**
 * Initializes and registers all configured WebMCP tools.
 * Safe to call multiple times across tabs and route changes.
 */
export async function initWebMcp(): Promise<boolean> {
  if (!isWebMcpSupported() || !navigator.modelContext) {
    return false;
  }

  try {
    for (const tool of webMcpTools) {
      if (!registeredToolNames.has(tool.name)) {
        await navigator.modelContext.registerTool(tool);
        registeredToolNames.add(tool.name);
        logToStdio('WEBMCP', `Initialized and registered WebMCP tool: "${tool.name}"`);
      }
    }
    return true;
  } catch (error) {
    logToStdio('WEBMCP', `Error initializing tools on navigator.modelContext: ${String(error)}`);
    return false;
  }
}

// Automatically invoke on module load if in a browser environment
if (typeof window !== 'undefined') {
  initWebMcp();
}
