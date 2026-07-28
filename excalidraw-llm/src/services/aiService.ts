import { convertToExcalidrawElements } from '@excalidraw/excalidraw';
import { GoogleGenAI } from '@google/genai';
import { buildLibraryCatalog, hydrateSkeletonsWithLibrary } from '../utils/libraryIndexer';
import { repairAndParseJson } from '../utils/jsonRepair';

export interface AIDiagramResult {
  chatReply: string;
  elements: any[];
}

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

export function getSystemInstruction(rawLibraryItems?: any[]): string {
  const catalog = buildLibraryCatalog(rawLibraryItems || []);
  const catalogText = catalog.length > 0
    ? `\n\nAVAILABLE ADVANCED LIBRARY COMPONENTS (You can reference these by libraryId in your elements array):\n${JSON.stringify(catalog)}`
    : '';

  return `You are a principal software architect and expert system designer.
Your task is to convert the user's request into a 2-PART JSON object containing a thorough, detailed explanation and a comprehensive Excalidraw diagram.

STRICT RULES:
1. Output ONLY a valid JSON object containing two keys: "chatReply" and "elements". Do NOT output conversational text outside the JSON.
2. "chatReply": Provide a COMPREHENSIVE, HIGHLY DETAILED architectural explanation (300 to 500 words) using STRUCTURED PLAIN TEXT ONLY.
   - NO MARKDOWN SYMBOLS ALLOWED: Do NOT use # headers, DO NOT use ** bolding, DO NOT use * italics/bullets, DO NOT use backticks.
   - Use clean UPPERCASE section titles ending with a colon (e.g. SYSTEM ARCHITECTURE & COMPONENTS:).
   - Use standard numbered lists (1., 2., 3.) and plain bullet dots for structured readability.
   - Detail the System Architecture, Component Roles, Data Flow Sequence, and Design Trade-offs.
3. "elements": Provide a RICH, MULTI-TIERED diagram array containing 8 to 15+ interconnected elements for architecture requests.
   - Organize into logical multi-tier columns or grid rows:
     * Tier 1 (Client / Ingress): CDN, Mobile/Web Clients, DNS.
     * Tier 2 (Gateway / Load Balancer): NGINX, API Gateway, Auth Microservice.
     * Tier 3 (Core Services & Workers): Application Microservices, Background Jobs.
     * Tier 4 (Persistence & Messaging): Redis Caches, Message Queues (Kafka/RabbitMQ), Databases (PostgreSQL/MongoDB).
   - Label arrows explicitly with interaction numbers and protocols (e.g. "1. HTTPS POST /login", "2. Validate JWT", "3. Redis Lookup", "4. SQL Query").
4. Supported element types: "rectangle", "ellipse", "diamond", "text", "arrow", "line", or "libraryItem".
5. To use an advanced library component, output: { "type": "libraryItem", "libraryId": "<exact_id>", "x": 100, "y": 200 }.
6. For shapes with text inside, specify "label": { "text": "Your Label", "fontSize": 16, "strokeColor": "#f3f4f6" }.
7. For shapes (rectangle, ellipse, diamond), provide unique "id", "x", "y", "width", "height", "backgroundColor", "strokeColor", "fillStyle".
8. For arrows connecting shapes, specify "type": "arrow", "start": { "id": "sourceId" }, "end": { "id": "targetId" }, and "label": { "text": "Step Label" }.
9. Space out shapes nicely on a clean grid (x difference of 350-450px, y difference of 220-300px) leaving a generous 180-250px gap between shapes for arrows and text labels. Ensure all shapes have unique IDs and arrows have start/end bindings.
10. Color scheme guidelines for dark theme:
   - Client / Frontend: backgroundColor "#1e1b4b", strokeColor "#6366f1"
   - Server / Service / Gateway: backgroundColor "#064e3b", strokeColor "#10b981"
   - Database / Storage: backgroundColor "#701a75", strokeColor "#d946ef"
   - Cache / Queue / Worker: backgroundColor "#7c2d12", strokeColor "#f97316"
   - Default shape: backgroundColor "#1f2937", strokeColor "#9ca3af"${catalogText}

Example JSON output format:
{
  "chatReply": "SYSTEM ARCHITECTURE BREAKDOWN\\n\\n1. COMPONENTS OVERVIEW:\\n• Web Client: React SPA communicating over HTTPS.\\n• API Gateway: Handles routing, rate limiting, and SSL termination.\\n• Auth Service: Validates JWT signatures.\\n• PostgreSQL Database: Primary relational data store.\\n\\n2. DATA FLOW & SEQUENCE:\\n1. Client issues POST /auth request to API Gateway.\\n2. Gateway routes request to Auth Service.\\n3. Auth Service queries PostgreSQL to verify user credentials.\\n4. On success, signed JWT is returned to Client.",
  "elements": [
    { "id": "client", "type": "rectangle", "x": 100, "y": 200, "width": 160, "height": 80, "label": { "text": "Web Client" }, "backgroundColor": "#1e1b4b", "strokeColor": "#6366f1", "fillStyle": "solid" },
    { "id": "api", "type": "rectangle", "x": 380, "y": 200, "width": 160, "height": 80, "label": { "text": "API Gateway" }, "backgroundColor": "#064e3b", "strokeColor": "#10b981", "fillStyle": "solid" },
    { "id": "db", "type": "ellipse", "x": 660, "y": 200, "width": 150, "height": 90, "label": { "text": "PostgreSQL DB" }, "backgroundColor": "#701a75", "strokeColor": "#d946ef", "fillStyle": "solid" },
    { "type": "arrow", "x": 260, "y": 240, "start": { "id": "client" }, "end": { "id": "api" }, "label": { "text": "1. HTTPS POST /auth" }, "strokeColor": "#9ca3af" },
    { "type": "arrow", "x": 540, "y": 240, "start": { "id": "api" }, "end": { "id": "db" }, "label": { "text": "2. SQL Query Credentials" }, "strokeColor": "#9ca3af" }
  ]
}`;
}

export function extractJsonPayload(text: string): string {
  if (!text) return '';
  let clean = text.trim();

  const mdMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (mdMatch && mdMatch[1]) {
    clean = mdMatch[1].trim();
  }

  const firstObj = clean.indexOf('{');
  const lastObj = clean.lastIndexOf('}');
  if (firstObj !== -1 && lastObj > firstObj) {
    return clean.substring(firstObj, lastObj + 1).trim();
  }

  const firstArr = clean.indexOf('[');
  const lastArr = clean.lastIndexOf(']');
  if (firstArr !== -1 && lastArr > firstArr) {
    return clean.substring(firstArr, lastArr + 1).trim();
  }

  return clean;
}

function processResponseJson(cleanJsonStr: string, rawLibraryItems: any[]): AIDiagramResult {
  const extracted = extractJsonPayload(cleanJsonStr);
  let parsed: any;
  try {
    parsed = repairAndParseJson(extracted);
  } catch (e) {
    console.error('Failed to parse AI JSON response:', cleanJsonStr, 'Extracted:', extracted);
    throw new Error('AI returned an invalid JSON response format. Please try rephrasing your prompt or selecting a smaller diagram scope.');
  }

  let chatReply = 'I have generated your requested diagram on the canvas.';
  let skeletons: any[] = [];

  if (Array.isArray(parsed)) {
    skeletons = parsed;
  } else if (parsed && typeof parsed === 'object') {
    if (typeof parsed.chatReply === 'string' && parsed.chatReply.trim()) {
      chatReply = stripMarkdown(parsed.chatReply.trim());
    }
    if (Array.isArray(parsed.elements)) {
      skeletons = parsed.elements;
    }
  }

  const { standardSkeletons, hydratedElements } = hydrateSkeletonsWithLibrary(skeletons, rawLibraryItems);
  const convertedStandard = convertToExcalidrawElements(standardSkeletons, { regenerateIds: true });
  const finalElements = [...convertedStandard, ...hydratedElements];

  return {
    chatReply,
    elements: finalElements
  };
}

function normalizeGeminiModel(modelName: string): string {
  const trimmed = (modelName || '').trim();
  return trimmed || 'gemini-3.1-flash-lite';
}

export async function generateDiagramFromPrompt(
  prompt: string,
  apiKey: string,
  modelName: string = 'gemini-3.1-flash-lite',
  rawLibraryItems: any[] = []
): Promise<AIDiagramResult> {
  if (!apiKey) {
    throw new Error('Gemini API key is required. Please set your API key in the chat header settings.');
  }

  const systemInstruction = getSystemInstruction(rawLibraryItems);
  const targetModel = normalizeGeminiModel(modelName);

  try {
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: targetModel,
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json'
      }
    });

    const rawText = typeof response?.text === 'string' ? response.text : '';
    let cleanJsonStr = rawText.trim();
    if (!cleanJsonStr) {
      throw new Error(`Gemini API (${targetModel}) returned no text content. Please check prompt or API key permissions.`);
    }
    if (cleanJsonStr.startsWith('```')) {
      cleanJsonStr = cleanJsonStr.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    }

    return processResponseJson(cleanJsonStr, rawLibraryItems);
  } catch (err: any) {
    console.error('Google Gen AI SDK Error:', err);
    throw new Error(`Gemini API Error (${targetModel}): ${err?.message || 'Failed to generate diagram.'}`);
  }
}

export async function generateDiagramWithOllama(
  prompt: string,
  endpoint: string = 'http://localhost:11434',
  modelName: string = 'gemma4:31b-cloud',
  apiKey: string = '',
  rawLibraryItems: any[] = []
): Promise<AIDiagramResult> {
  const cleanEndpoint = (endpoint.trim() || 'http://localhost:11434').replace(/\/+$/, '');
  const cleanModel = modelName.trim() || 'gemma4:31b-cloud';
  const systemInstruction = getSystemInstruction(rawLibraryItems);
  const url = `${cleanEndpoint}/api/chat`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey.trim()) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }

  const requestBody = {
    model: cleanModel,
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: prompt }
    ],
    format: 'json',
    stream: false
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });
  } catch (err: any) {
    // Retry via Cloudflare Pages Proxy endpoint (/api/proxy) if direct browser fetch fails (CORS / Mixed Content)
    try {
      response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl: url,
          headers,
          body: requestBody
        })
      });
    } catch (proxyErr: any) {
      if (cleanEndpoint.startsWith('https://ollama.com')) {
        throw new Error(
          `Direct browser calls to https://ollama.com are blocked by browser CORS. ` +
          `To use cloud models, keep Endpoint set to http://localhost:11434 and specify cloud model name (e.g. gemma4:31b-cloud).`
        );
      }
      throw new Error(`Unable to connect to Ollama host at ${cleanEndpoint}. Please verify URL, API key, or CORS settings.`);
    }
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Ollama Error (${response.status}): ${errText || response.statusText}`);
  }

  const data = await response.json();
  const rawText = data?.message?.content || data?.response || '';

  let cleanJsonStr = rawText.trim();
  if (cleanJsonStr.startsWith('```')) {
    cleanJsonStr = cleanJsonStr.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  }

  return processResponseJson(cleanJsonStr, rawLibraryItems);
}
