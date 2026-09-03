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

  interface Document {
    modelContext?: ModelContext;
  }

  interface Window {
    modelContext?: ModelContext;
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
  generateDiagram?: (prompt: string) => Promise<{ chatReply: string; elements: any[] }>;
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
    logToStdio('WEBMCP', 'Tool "get_canvas_visual_snapshot" captured canvas image', { bytes: snapshot.length });
    // Return the FULL base64 PNG so external WebMCP hosts (navigator/document/window.modelContext)
    // can actually see the canvas. Internal agent loops (aiService/voiceService) must route this
    // result through compactToolResultForModel() before echoing it into LLM context.
    return {
      status: 'success',
      hasImage: true,
      mimeType: 'image/png',
      imageLength: snapshot.length,
      imageBase64: snapshot
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

const EXCALIDRAW_COLOR_PALETTE: Record<string, string> = {
  white: '#ffffff',
  black: '#1e1e1e',
  gray: '#ced4da',
  grey: '#ced4da',
  darkgray: '#495057',
  darkgrey: '#495057',
  lightgray: '#f8f9fa',
  lightgrey: '#f8f9fa',
  transparent: 'transparent',
  yellow: '#ffe066',
  blue: '#a5d8ff',
  green: '#8ce99a',
  red: '#ff8787',
  orange: '#ffd8a8',
  purple: '#d0bfff',
  violet: '#e599f7',
  pink: '#fcc2d7',
  teal: '#96f2d7',
  cyan: '#99e9f2',
  indigo: '#bac8ff'
};

function normalizeCanvasColor(color?: string): string | undefined {
  if (!color) return undefined;
  const lower = color.trim().toLowerCase();
  if (EXCALIDRAW_COLOR_PALETTE[lower]) {
    return EXCALIDRAW_COLOR_PALETTE[lower];
  }
  if (lower.startsWith('#') || lower.startsWith('rgb') || lower.startsWith('hsl')) {
    return color.trim();
  }
  return color.trim();
}

export const modifyCanvasNodeTool: WebMcpTool = {
  name: 'modify_canvas_node',
  description: 'Performs a targeted in-place modification on an existing canvas node (renaming label, updating border/fill colors, or changing coordinates) without clearing or affecting other elements on the canvas.',
  readOnly: false,
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: {
        type: 'string',
        description: 'The unique ID or text label of the node to modify (e.g. "Redis Cache", "Order Service", or element ID).'
      },
      newLabel: {
        type: 'string',
        description: 'The new label or text for the node.'
      },
      strokeColor: {
        type: 'string',
        description: 'Optional new border color (hex code or color name like "blue", "red", "green", "yellow", "purple").'
      },
      backgroundColor: {
        type: 'string',
        description: 'Optional new background fill color (hex code or color name like "blue", "red", "green", "yellow", "purple").'
      }
    },
    required: ['nodeId']
  },
  execute: async (args: { nodeId: string; newLabel?: string; strokeColor?: string; backgroundColor?: string }) => {
    const rawElements = activeCanvasBridge?.getElements ? activeCanvasBridge.getElements() : [];
    if (!rawElements.length || !activeCanvasBridge?.setElements) {
      return { error: 'No active canvas elements found to modify' };
    }

    const targetQuery = String(args.nodeId || '').trim().toLowerCase();
    if (!targetQuery) {
      return { error: 'nodeId query is required' };
    }

    const normBg = normalizeCanvasColor(args.backgroundColor);
    const normStroke = normalizeCanvasColor(args.strokeColor);

    // 1. First Pass: Identify all matched elements (by ID, label, text) and collect their container/bound IDs
    const matchedElementIds = new Set<string>();

    for (const el of rawElements) {
      if (!el || el.isDeleted) continue;
      const elId = String(el.id || '').toLowerCase();
      const elText = typeof el.text === 'string' ? el.text.toLowerCase() : '';
      const elLabel = el.label && typeof el.label.text === 'string' ? el.label.text.toLowerCase() : '';

      const isExactId = elId === targetQuery;
      const isTextMatch = (elText && (elText.includes(targetQuery) || targetQuery.includes(elText))) ||
                          (elLabel && (elLabel.includes(targetQuery) || targetQuery.includes(elLabel)));

      if (isExactId || isTextMatch) {
        matchedElementIds.add(el.id);
        // If it's a bound text element, also match its parent container shape!
        if (el.containerId) {
          matchedElementIds.add(el.containerId);
        }
        // If it's a container with bound elements, also match all its bound text elements!
        if (Array.isArray(el.boundElements)) {
          for (const b of el.boundElements) {
            if (b?.id) matchedElementIds.add(b.id);
          }
        }
      }
    }

    if (matchedElementIds.size === 0) {
      logToStdio('WEBMCP', `Tool "modify_canvas_node" found no node matching '${args.nodeId}'`);
      return { status: 'not_found', message: `No node found matching '${args.nodeId}'.` };
    }

    // 2. Second Pass: Apply modifications to all matched elements and their bound text/containers
    const updatedElements = rawElements.map((el: any) => {
      if (!matchedElementIds.has(el.id)) {
        return normalizeLinearElement(el);
      }

      const updated = { ...el };

      // Update background fill & ensure solid fillStyle on shapes
      if (normBg !== undefined) {
        if (updated.type !== 'arrow' && updated.type !== 'line') {
          updated.backgroundColor = normBg;
          if (normBg !== 'transparent') {
            updated.fillStyle = 'solid';
          }
        }
      }

      // Update stroke color
      if (normStroke !== undefined) {
        updated.strokeColor = normStroke;
      }

      // Update text / label
      if (args.newLabel) {
        if (updated.type === 'text') {
          updated.text = args.newLabel;
          updated.originalText = args.newLabel;
        }
        if (updated.label) {
          if (typeof updated.label === 'object') {
            updated.label = { ...updated.label, text: args.newLabel };
          } else {
            updated.label = { text: args.newLabel };
          }
        }
      }

      // Bump version & nonce so Excalidraw forcibly re-renders the element
      updated.version = (updated.version || 1) + 1;
      updated.versionNonce = Math.floor(Math.random() * 2000000000);

      return normalizeLinearElement(updated);
    });

    activeCanvasBridge.setElements(updatedElements);
    logToStdio('WEBMCP', `Tool "modify_canvas_node" updated ${matchedElementIds.size} elements matching '${args.nodeId}'`, {
      matchedIds: Array.from(matchedElementIds),
      backgroundColor: normBg,
      strokeColor: normStroke,
      newLabel: args.newLabel
    });

    return {
      status: 'success',
      message: `Updated node matching '${args.nodeId}' in-place (${matchedElementIds.size} elements modified).`,
      matchedElementCount: matchedElementIds.size
    };
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

export const generateDiagramAndExplanationTool: WebMcpTool = {
  name: 'generate_diagram_and_explanation',
  description: 'Synthesizes a complete visual architecture diagram on the Excalidraw canvas and produces a structured technical breakdown. Use this tool when the user asks to draw, design, or generate an architecture diagram.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'The architectural or system design prompt describing what diagram and components to generate (e.g. "Draw an event-driven payment system with Kafka, Redis, and PostgreSQL").'
      }
    },
    required: ['prompt']
  },
  execute: async (params: { prompt?: string }) => {
    const promptText = (params?.prompt || '').trim();
    if (!promptText) {
      return { error: 'Prompt is required for diagram generation' };
    }

    if (!activeCanvasBridge) {
      return { error: 'No active canvas is mounted.' };
    }

    logToStdio('WEBMCP', `Tool "generate_diagram_and_explanation" invoked with prompt: "${promptText}"`);

    if (activeCanvasBridge.generateDiagram) {
      try {
        const result = await activeCanvasBridge.generateDiagram(promptText);
        return {
          status: 'success',
          summary: `Successfully generated architecture diagram with ${result.elements?.length || 0} visual components on the canvas.`,
          chatReply: result.chatReply,
          componentCount: result.elements?.length || 0
        };
      } catch (err: any) {
        logToStdio('WEBMCP', `Tool "generate_diagram_and_explanation" error: ${String(err)}`);
        return { error: `Diagram generation failed: ${String(err?.message || err)}` };
      }
    }

    return { error: 'Diagram generation delegate is not configured on the active workspace.' };
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
  clearCanvasTool,
  generateDiagramAndExplanationTool
];

// Internal set of registered tool names to ensure idempotent registration across tabs/renders
const registeredToolNames = new Set<string>();

function getModelContextTargets(): ModelContext[] {
  const targets: ModelContext[] = [];
  if (typeof navigator !== 'undefined' && (navigator as any).modelContext?.registerTool) {
    targets.push((navigator as any).modelContext);
  }
  if (typeof document !== 'undefined' && (document as any).modelContext?.registerTool) {
    targets.push((document as any).modelContext);
  }
  if (typeof window !== 'undefined' && (window as any).modelContext?.registerTool) {
    targets.push((window as any).modelContext);
  }
  return targets;
}

/**
 * Check if the browser currently supports WebMCP on any target.
 */
export function isWebMcpSupported(): boolean {
  return getModelContextTargets().length > 0;
}

/**
 * Registers a single tool with all available modelContext targets.
 */
export async function registerWebMcpTool(tool: WebMcpTool): Promise<boolean> {
  const targets = getModelContextTargets();
  if (targets.length === 0) {
    return false;
  }

  try {
    for (const target of targets) {
      await target.registerTool(tool);
    }
    registeredToolNames.add(tool.name);
    logToStdio('WEBMCP', `Registered WebMCP tool: "${tool.name}" on modelContext (${targets.length} target(s))`);
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
  const targets = getModelContextTargets();
  if (targets.length === 0) {
    return false;
  }

  try {
    for (const tool of webMcpTools) {
      if (!registeredToolNames.has(tool.name)) {
        for (const target of targets) {
          await target.registerTool(tool);
        }
        registeredToolNames.add(tool.name);
        logToStdio('WEBMCP', `Initialized and registered WebMCP tool: "${tool.name}"`);
      }
    }
    return true;
  } catch (error) {
    logToStdio('WEBMCP', `Error initializing tools on modelContext: ${String(error)}`);
    return false;
  }
}

// Automatically invoke on module load if in a browser environment.
// Uses the retrying initializer: modelContext targets are often injected by
// the host browser/extension AFTER this module first evaluates.
if (typeof window !== 'undefined') {
  ensureWebMcpInitialized();
}

const WEBMCP_INIT_MAX_ATTEMPTS = 5;
const WEBMCP_INIT_RETRY_DELAY_MS = 800;

const sleepAsync = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Resilient WebMCP initialization: retries while no modelContext targets are
 * available (browser/extension hydration race at page load), and is invoked
 * again from App.tsx once the auth gate resolves.
 * Idempotent — initWebMcp() skips already-registered tools via registeredToolNames.
 */
export async function ensureWebMcpInitialized(): Promise<boolean> {
  for (let attempt = 1; attempt <= WEBMCP_INIT_MAX_ATTEMPTS; attempt++) {
    const ok = await initWebMcp();
    if (ok) {
      return true;
    }
    if (getModelContextTargets().length === 0 && attempt < WEBMCP_INIT_MAX_ATTEMPTS) {
      logToStdio('WEBMCP', `modelContext targets not ready (attempt ${attempt}/${WEBMCP_INIT_MAX_ATTEMPTS}), retrying in ${WEBMCP_INIT_RETRY_DELAY_MS}ms...`);
      await sleepAsync(WEBMCP_INIT_RETRY_DELAY_MS);
    }
  }
  logToStdio('WEBMCP', 'WebMCP init gave up: modelContext targets never became available or registration failed');
  return false;
}

/**
 * Tools whose raw results embed very large payloads (full base64 PNG snapshots)
 * that must never be echoed verbatim into internal LLM context. Internal agent
 * loops pass tool results through this helper before feeding the model, while
 * external WebMCP hosts receive the complete result.
 */
export function compactToolResultForModel(toolName: string, result: any): any {
  if (!result || typeof result !== 'object') {
    return result;
  }
  if (toolName === 'get_canvas_visual_snapshot' && typeof result.imageBase64 === 'string') {
    const { imageBase64, ...rest } = result;
    return {
      ...rest,
      previewUrl: imageBase64.substring(0, 80) + '...',
      note: 'Full base64 PNG payload (imageBase64) omitted from model context for budget; it remains available to external WebMCP hosts.'
    };
  }
  return result;
}
