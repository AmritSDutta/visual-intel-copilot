/**
 * WebMCP (Web Model Context Protocol) Service
 * 
 * Provides modular, read-only tools exposed to browser-level AI / Model Context API
 * (`navigator.modelContext`) across all tabs and routes.
 */

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

/**
 * Sends a log entry to the backend Vite dev server middleware (/api/log)
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
 * 1. Read-Only Tool: Returns the current date and time in Indian Standard Time (IST).
 */
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

    // Write to stdio terminal console
    logToStdio('WEBMCP', 'Tool "get_current_ist_date" was called!', { ist: istString });

    return { ist: istString };
  }
};

/**
 * Registry of all available WebMCP tools.
 * Add additional modular tools here as needed.
 */
export const webMcpTools: readonly WebMcpTool[] = [
  getCurrentIstDateTool
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
    // Model context not available in current browser / environment
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
