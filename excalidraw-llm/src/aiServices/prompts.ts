import { buildLibraryCatalog } from '../utils/libraryIndexer';

/**
 * Prompt templates live as .md files in ./prompt/ — edit them there.
 * They are inlined at build time (Vite raw imports); {{PLACEHOLDER}} tokens
 * are filled by the getters below with dynamic context (catalog, canvas, greeting).
 */
const templates = import.meta.glob('./prompt/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function loadTemplate(name: string): string {
  const entry = Object.entries(templates).find(([path]) => path.endsWith(`/${name}.md`));
  if (!entry) {
    throw new Error(`Prompt template not found: prompt/${name}.md`);
  }
  return entry[1];
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}

// ── dynamic section builders ────────────────────────────────

function libraryCatalogSection(rawLibraryItems?: any[], slice?: number, header: string = 'AVAILABLE ADVANCED LIBRARY COMPONENTS (You can reference these by libraryId in your elements array)'): string {
  let catalog = buildLibraryCatalog(rawLibraryItems || []);
  if (slice) {
    catalog = catalog.slice(0, slice);
  }
  return catalog.length > 0
    ? `\n\n${header}:\n${JSON.stringify(catalog)}`
    : '';
}

function canvasTopologySection(canvasTopologyText: string | undefined, lead: string, actionLine: string): string {
  return canvasTopologyText && canvasTopologyText !== 'Canvas is currently empty.'
    ? `\n\n${lead}:\n${canvasTopologyText}\n${actionLine}\n`
    : '';
}

// ── exported prompt getters (same API as before) ────────────

export function stripMarkdown(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/^#+\s+/gm, '')             // Remove # headers
    .replace(/\*\*(.*?)\*\*/g, '$1')     // Remove **bold**
    .replace(/\*(.*?)\*/g, '$1')         // Remove *italic*
    .replace(/`(.*?)`/g, '$1')           // Remove `code`
    .replace(/^\s*[-*+]\s+/gm, '• ')     // Replace markdown bullets with clean bullet dot
    .replace(/---/g, '')                 // Remove horizontal rules
    .trim();
}

/**
 * ⚡ Groq Specialized System Instruction: TEXT EXPLANATION ONLY (No Diagram JSON).
 * Ultra-fast ~300ms execution with structured plain-text architectural breakdown.
 */
export function getGroqTextOnlySystemInstruction(canvasTopologyText?: string): string {
  return fillTemplate(loadTemplate('groqTextOnly'), {
    CANVAS_TOPOLOGY_SECTION: canvasTopologySection(
      canvasTopologyText,
      'CURRENT CANVAS TOPOLOGY',
      'Build upon or explain the current canvas state.'
    )
  });
}

/**
 * 🦔 Mistral Specialized System Instruction: DIAGRAM ELEMENTS ONLY (No Text Explanation).
 * Focuses 100% on spatial coordinates, multi-tier node layout, connector arrows, and library stencils.
 */
export function getMistralDiagramOnlySystemInstruction(rawLibraryItems?: any[], canvasTopologyText?: string): string {
  return fillTemplate(loadTemplate('mistralDiagramOnly'), {
    LIBRARY_CATALOG_SECTION: libraryCatalogSection(
      rawLibraryItems,
      25,
      'AVAILABLE ADVANCED LIBRARY STENCILS (Reference by libraryId in elements)'
    ),
    CANVAS_TOPOLOGY_SECTION: canvasTopologySection(
      canvasTopologyText,
      'EXISTING CANVAS TOPOLOGY',
      'Connect new components intelligently to existing nodes.'
    )
  });
}

/** Gemini full 2-part contract (chatReply + elements) — used by the Canvas fallback path. */
export function getFullSystemInstruction(rawLibraryItems?: any[]): string {
  return fillTemplate(loadTemplate('geminiFullDiagram'), {
    LIBRARY_CATALOG_SECTION: libraryCatalogSection(rawLibraryItems)
  });
}

export function getSystemInstruction(rawLibraryItems?: any[]): string {
  return getFullSystemInstruction(rawLibraryItems);
}

/**
 * 🎙️ Main Live Agent persona — drives the native bidirectional Gemini Live session.
 * The agent decides ITSELF when to call a tool; tools are the subagents + canvas ops.
 */
export function getLiveAgentSystemInstruction(greeting: string): string {
  return fillTemplate(loadTemplate('liveAgent'), { GREETING: greeting, ...currentDateContext() });
}

/**
 * 💬 Canvas orchestrator persona — the tool-calling base agent for the canvas chat panel.
 */
export function getCanvasOrchestratorSystemInstruction(): string {
  return fillTemplate(loadTemplate('canvasOrchestrator'), currentDateContext());
}

/** Fills the {{CURRENT_DATE}} token shared by both base-agent prompts (IST, matching get_current_ist_date). */
function currentDateContext(): Record<string, string> {
  const istDate = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full' });
  return { CURRENT_DATE: `${istDate} (Indian Standard Time)` };
}
