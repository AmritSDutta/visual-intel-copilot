import { convertToExcalidrawElements } from '@excalidraw/excalidraw';
import { GoogleGenAI, Type } from '@google/genai';
import { hydrateSkeletonsWithLibrary, sanitizeSkeletonsForExcalidraw, normalizeLinearElement } from '../utils/libraryIndexer';
import { repairAndParseJson } from '../utils/jsonRepair';
import { webMcpTools, compactToolResultForModel } from './webMcpService';
import { getSystemInstruction, stripMarkdown, getCanvasOrchestratorSystemInstruction } from '../aiServices/prompts';
import { extractJsonPayload } from '../aiServices/parse';
import { decryptString } from '../utils/cryptoStorage';
import {
  AI_TASKS,
  TASK_MODEL_REGISTRY,
  getCandidateModelsForTask
} from '../config/aiModelsConfig';

export interface AIDiagramResult {
  chatReply: string;
  elements: any[];
}

export interface CanvasAgentRunOptions {
  query: string;
  messages?: Array<{ role?: string; sender?: string; content?: string; text?: string }>;
  provider: 'gemini' | 'ollama';
  apiKey?: string;
  modelName?: string;
  ollamaEndpoint?: string;
  ollamaModel?: string;
  ollamaApiKey?: string;
  rawLibraryItems?: any[];
}

export interface CanvasAgentResult {
  chatReply: string;
  toolsCalled: string[];
}

export { getSystemInstruction, stripMarkdown, extractJsonPayload };

function processResponseJson(cleanJsonStr: string, rawLibraryItems: any[]): AIDiagramResult {
  if (!cleanJsonStr || !cleanJsonStr.trim()) {
    return { chatReply: '', elements: [] };
  }

  const extracted = extractJsonPayload(cleanJsonStr);
  let parsed: any;
  try {
    parsed = repairAndParseJson(extracted);
  } catch {
    // If response is plain text (e.g. conversational answer), return chat reply directly
    return {
      chatReply: stripMarkdown(cleanJsonStr),
      elements: []
    };
  }

  let chatReply = 'I have generated your requested diagram on the canvas.';
  let skeletons: any[] = [];

  if (Array.isArray(parsed)) {
    skeletons = parsed;
  } else if (parsed && typeof parsed === 'object') {
    if (typeof parsed.chatReply === 'string' && parsed.chatReply.trim()) {
      chatReply = stripMarkdown(parsed.chatReply.trim());
    } else if (parsed.response || parsed.message || parsed.text) {
      chatReply = stripMarkdown(String(parsed.response || parsed.message || parsed.text));
    }
    if (Array.isArray(parsed.elements)) {
      skeletons = parsed.elements;
    }
  } else {
    chatReply = stripMarkdown(cleanJsonStr);
  }

  const { standardSkeletons, hydratedElements } = hydrateSkeletonsWithLibrary(skeletons, rawLibraryItems);
  const sanitizedSkeletons = sanitizeSkeletonsForExcalidraw(standardSkeletons);
  const convertedStandard = convertToExcalidrawElements(sanitizedSkeletons, { regenerateIds: false });
  const finalElements = [...convertedStandard, ...hydratedElements].map(normalizeLinearElement);

  return {
    chatReply,
    elements: finalElements
  };
}

/**
 * Dedicated Subagent Diagram Generation Engine.
 * Produces structured Excalidraw JSON payloads and hydrates library stencils.
 */
export async function generateDiagramFromPrompt(
  prompt: string,
  apiKey: string,
  modelName?: string,
  rawLibraryItems: any[] = []
): Promise<AIDiagramResult> {
  const resolvedApiKey = (apiKey || '').startsWith('__ENC__:v1:')
    ? await decryptString(apiKey || '')
    : (apiKey || '').trim();

  if (!resolvedApiKey) {
    throw new Error('Gemini API key is required. Please set your API key in the settings (⚙️) panel.');
  }

  const systemInstruction = getSystemInstruction(rawLibraryItems);
  const candidateModels = getCandidateModelsForTask(AI_TASKS.CANVAS_DIAGRAM_ENGINE, modelName);

  let lastError: Error | null = null;
  const ai = new GoogleGenAI({ apiKey: resolvedApiKey });

  for (const targetModel of candidateModels) {
    try {
      console.log(`[Gemini Subagent] Synthesizing diagram vector payload on model: ${targetModel}`);
      const contents: any[] = [{ role: 'user', parts: [{ text: prompt }] }];

      const response = await ai.models.generateContent({
        model: targetModel,
        contents,
        config: {
          systemInstruction,
          temperature: TASK_MODEL_REGISTRY.CANVAS_DIAGRAM_ENGINE.temperature,
          maxOutputTokens: TASK_MODEL_REGISTRY.CANVAS_DIAGRAM_ENGINE.maxOutputTokens
        }
      });

      const rawText = response.text || '';
      return processResponseJson(rawText, rawLibraryItems);
    } catch (e: any) {
      console.warn(`[Gemini Subagent] Model ${targetModel} failed:`, e);
      lastError = e;
    }
  }

  throw lastError || new Error('Failed to generate diagram from Gemini.');
}

/**
 * Primary Canvas Orchestrator Agent.
 * Runs multi-turn tool calling across all 9 WebMCP tools and delegates diagram synthesis
 * to the 'generate_diagram_and_explanation' subagent tool.
 */
export async function runCanvasOrchestratorAgent(
  options: CanvasAgentRunOptions
): Promise<CanvasAgentResult> {
  const {
    query,
    messages = [],
    provider,
    apiKey,
    modelName,
    ollamaEndpoint = 'https://ollama.com',
    ollamaModel = 'gemma4:31b-cloud',
    ollamaApiKey = '',
    rawLibraryItems: _rawLibraryItems = []
  } = options;

  const toolsCalled: string[] = [];

  // ==========================================
  // Track 1: GEMINI CLOUD ORCHESTRATOR
  // ==========================================
  if (provider === 'gemini') {
    const resolvedApiKey = (apiKey || '').startsWith('__ENC__:v1:')
      ? await decryptString(apiKey || '')
      : (apiKey || '').trim();

    if (!resolvedApiKey) {
      throw new Error('Gemini API key is required. Please set your API key in Settings (⚙️).');
    }

    const candidateModels = getCandidateModelsForTask(AI_TASKS.CANVAS_MAIN_AGENT, modelName);
    const ai = new GoogleGenAI({ apiKey: resolvedApiKey });

    const functionDeclarations = webMcpTools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: {
        type: Type.OBJECT,
        properties: (t.inputSchema.properties || {}) as any,
        required: (t.inputSchema.required as string[]) || []
      }
    }));

    let lastError: Error | null = null;

    for (const targetModel of candidateModels) {
      try {
        console.log(`[Canvas Agent] Orchestrating query via Gemini model: ${targetModel}`);

        // Build conversational turn history
        const contents: any[] = [];
        const recentHistory = messages.slice(-8);

        for (const msg of recentHistory) {
          const role = (msg.sender === 'assistant' || msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';
          const text = msg.text || msg.content || '';
          if (text.trim()) {
            contents.push({ role, parts: [{ text }] });
          }
        }

        // Add current user turn
        contents.push({ role: 'user', parts: [{ text: query }] });

        let response = await ai.models.generateContent({
          model: targetModel,
          contents,
          config: {
            systemInstruction: getCanvasOrchestratorSystemInstruction(),
            temperature: TASK_MODEL_REGISTRY.CANVAS_MAIN_AGENT.temperature,
            maxOutputTokens: TASK_MODEL_REGISTRY.CANVAS_MAIN_AGENT.maxOutputTokens,
            tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined
          }
        });

        // Multi-turn tool calling loop
        let turns = 0;
        while (response.functionCalls && response.functionCalls.length > 0 && turns < 5) {
          turns++;
          console.log(`[Canvas Agent] Tool calls triggered (turn ${turns}):`, response.functionCalls);

          const modelContent = response.candidates?.[0]?.content || {
            role: 'model',
            parts: response.functionCalls.map((c) => ({ functionCall: { name: c.name, args: c.args || {} } }))
          };
          contents.push(modelContent);

          const functionResponseParts: any[] = [];
          for (const call of response.functionCalls) {
            const callName = call.name || '';
            if (callName) {
              toolsCalled.push(callName);
            }
            const tool = webMcpTools.find((t) => t.name === callName);
            let toolResult: any = { error: `Tool "${callName}" not found` };
            if (tool) {
              try {
                toolResult = await tool.execute(call.args || {});
              } catch (toolErr: any) {
                toolResult = { error: String(toolErr?.message || toolErr) };
              }
            }
            functionResponseParts.push({
              functionResponse: {
                name: callName,
                response: compactToolResultForModel(callName, toolResult)
              }
            });
          }

          contents.push({
            role: 'user',
            parts: functionResponseParts
          });

          response = await ai.models.generateContent({
            model: targetModel,
            contents,
            config: {
              systemInstruction: getCanvasOrchestratorSystemInstruction(),
              temperature: TASK_MODEL_REGISTRY.CANVAS_MAIN_AGENT.temperature,
              maxOutputTokens: TASK_MODEL_REGISTRY.CANVAS_MAIN_AGENT.maxOutputTokens,
              tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined
            }
          });
        }

        const replyText = response.text || '';
        const finalReply = replyText.trim()
          ? replyText.trim()
          : toolsCalled.length > 0
          ? `Executed action (${toolsCalled.join(', ')}) on canvas successfully.`
          : 'Processed your request.';

        return {
          chatReply: finalReply,
          toolsCalled
        };
      } catch (err: any) {
        console.warn(`[Canvas Agent] Model ${targetModel} failed:`, err);
        lastError = err;
      }
    }

    throw lastError || new Error('Failed to complete request with Gemini Orchestrator.');
  }

  // ==========================================
  // Track 2: OLLAMA CLOUD & LOCAL ORCHESTRATOR
  // ==========================================
  const cleanEndpoint = (ollamaEndpoint || 'https://ollama.com').replace(/\/+$/, '');
  const cleanModel = (ollamaModel || 'gemma4:31b-cloud').trim();
  const isRemote = cleanEndpoint.startsWith('https://') || (!cleanEndpoint.includes('localhost') && !cleanEndpoint.includes('127.0.0.1'));
  const url = `${cleanEndpoint}/api/chat`;

  const resolvedOllamaKey = (ollamaApiKey || '').startsWith('__ENC__:v1:')
    ? await decryptString(ollamaApiKey || '')
    : (ollamaApiKey || '').trim();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (resolvedOllamaKey) {
    headers['Authorization'] = `Bearer ${resolvedOllamaKey}`;
  }

  const ollamaTools = webMcpTools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
        properties: t.inputSchema.properties || {},
        required: (t.inputSchema.required as string[]) || []
      }
    }
  }));

  const historyMessages: any[] = [
    { role: 'system', content: getCanvasOrchestratorSystemInstruction() }
  ];

  for (const msg of messages.slice(-8)) {
    const role = (msg.sender === 'assistant' || msg.role === 'assistant') ? 'assistant' : 'user';
    const content = msg.text || msg.content || '';
    if (content.trim()) {
      historyMessages.push({ role, content });
    }
  }
  historyMessages.push({ role: 'user', content: query });

  const initialBody = {
    model: cleanModel,
    messages: historyMessages,
    stream: false,
    tools: ollamaTools.length > 0 ? ollamaTools : undefined
  };

  let response: Response;
  try {
    if (isRemote) {
      response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl: url, headers, body: initialBody })
      });
    } else {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(initialBody)
      });
    }
  } catch {
    response = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUrl: url, headers, body: initialBody })
    });
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Ollama Error (${response.status}): ${errText || response.statusText}`);
  }

  let currentData = await response.json();
  let turns = 0;

  while (
    currentData?.message?.tool_calls &&
    Array.isArray(currentData.message.tool_calls) &&
    currentData.message.tool_calls.length > 0 &&
    turns < 5
  ) {
    turns++;
    historyMessages.push(currentData.message);

    for (const call of currentData.message.tool_calls) {
      const fnName = call?.function?.name || '';
      const fnArgs = typeof call?.function?.arguments === 'string'
        ? JSON.parse(call.function.arguments)
        : (call?.function?.arguments || {});

      if (fnName) {
        toolsCalled.push(fnName);
      }
      const tool = webMcpTools.find((t) => t.name === fnName);
      let toolResult: any = { error: `Tool "${fnName}" not found` };
      if (tool) {
        try {
          toolResult = await tool.execute(fnArgs);
        } catch (toolErr: any) {
          toolResult = { error: String(toolErr?.message || toolErr) };
        }
      }

      historyMessages.push({
        role: 'tool',
        content: JSON.stringify(compactToolResultForModel(fnName, toolResult))
      });
    }

    const followUpBody = {
      model: cleanModel,
      messages: historyMessages,
      stream: false,
      tools: ollamaTools.length > 0 ? ollamaTools : undefined
    };

    let followUpRes: Response;
    try {
      if (isRemote) {
        followUpRes = await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUrl: url, headers, body: followUpBody })
        });
      } else {
        followUpRes = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(followUpBody)
        });
      }
    } catch {
      followUpRes = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl: url, headers, body: followUpBody })
      });
    }

    if (followUpRes && followUpRes.ok) {
      currentData = await followUpRes.json();
    } else {
      break;
    }
  }

  const rawText = currentData?.message?.content || currentData?.response || '';
  return {
    chatReply: rawText.trim() || `Executed action (${toolsCalled.join(', ')}) on canvas.`,
    toolsCalled
  };
}

export async function generateDiagramWithOllama(
  prompt: string,
  endpoint: string = 'https://ollama.com',
  modelName: string = 'gemma4:31b-cloud',
  apiKey: string = '',
  rawLibraryItems: any[] = []
): Promise<AIDiagramResult> {
  const cleanEndpoint = (endpoint.trim() || 'https://ollama.com').replace(/\/+$/, '');
  const cleanModel = modelName.trim() || 'gemma4:31b-cloud';
  const systemInstruction = getSystemInstruction(rawLibraryItems);
  const url = `${cleanEndpoint}/api/chat`;

  const resolvedOllamaKey = (apiKey || '').startsWith('__ENC__:v1:')
    ? await decryptString(apiKey || '')
    : (apiKey || '').trim();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (resolvedOllamaKey) {
    headers['Authorization'] = `Bearer ${resolvedOllamaKey}`;
  }

  const ollamaTools = webMcpTools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
        properties: t.inputSchema.properties || {},
        required: (t.inputSchema.required as string[]) || []
      }
    }
  }));

  const messages: any[] = [
    { role: 'system', content: systemInstruction },
    { role: 'user', content: prompt }
  ];

  const requestBody: Record<string, any> = {
    model: cleanModel,
    messages,
    format: 'json',
    stream: false,
    tools: ollamaTools.length > 0 ? ollamaTools : undefined
  };

  const isRemote = cleanEndpoint.startsWith('https://') || (!cleanEndpoint.includes('localhost') && !cleanEndpoint.includes('127.0.0.1'));

  let response: Response;
  try {
    if (isRemote) {
      // Remote endpoints like ollama.com must be proxied to avoid browser CORS restrictions
      response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl: url,
          headers,
          body: requestBody
        })
      });
    } else {
      // Localhost / 127.0.0.1 direct fetch
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });
    }
  } catch (err: any) {
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
    } catch {
      if (cleanEndpoint.startsWith('https://ollama.com')) {
        throw new Error(
          'Failed to reach Ollama Cloud API. Please ensure your Ollama API Key / Bearer token is provided if required, or check proxy connectivity.'
        );
      }
      throw new Error(`Unable to connect to Ollama host at ${cleanEndpoint}. Please verify the URL, API key, and network connectivity.`);
    }
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    if (response.status === 401) {
      throw new Error(
        `Ollama Authentication Failed (401 Unauthorized). If using Ollama Cloud (${cleanEndpoint}), please provide your API Key in Settings (⚙️), switch to Gemini, or use a local Ollama server at http://localhost:11434.`
      );
    }
    throw new Error(`Ollama Error (${response.status}): ${errText || response.statusText}`);
  }

  let currentData = await response.json();
  let ollamaTurns = 0;

  // Multi-turn tool calling loop for Ollama (e.g. find_canvas_nodes -> modify_canvas_node)
  while (
    currentData?.message?.tool_calls &&
    Array.isArray(currentData.message.tool_calls) &&
    currentData.message.tool_calls.length > 0 &&
    ollamaTurns < 5
  ) {
    ollamaTurns++;
    console.log(`[Ollama] Model invoked tool_calls (turn ${ollamaTurns}):`, currentData.message.tool_calls);
    messages.push(currentData.message);

    for (const call of currentData.message.tool_calls) {
      const fnName = call?.function?.name;
      const fnArgs = typeof call?.function?.arguments === 'string'
        ? JSON.parse(call.function.arguments)
        : (call?.function?.arguments || {});

      const tool = webMcpTools.find((t) => t.name === fnName);
      let toolResult: any = { error: `Tool "${fnName}" not found` };
      if (tool) {
        try {
          toolResult = await tool.execute(fnArgs);
        } catch (toolErr: any) {
          toolResult = { error: String(toolErr?.message || toolErr) };
        }
      }

      messages.push({
        role: 'tool',
        content: JSON.stringify(compactToolResultForModel(fnName, toolResult))
      });
    }

    const followUpBody = {
      model: cleanModel,
      messages,
      format: 'json',
      stream: false,
      tools: ollamaTools.length > 0 ? ollamaTools : undefined
    };

    let followUpResponse: Response | null = null;
    try {
      if (isRemote) {
        followUpResponse = await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetUrl: url,
            headers,
            body: followUpBody
          })
        });
      } else {
        followUpResponse = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(followUpBody)
        });
      }
    } catch {
      followUpResponse = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl: url,
          headers,
          body: followUpBody
        })
      }).catch(() => null);
    }

    if (followUpResponse && followUpResponse.ok) {
      currentData = await followUpResponse.json();
    } else {
      break;
    }
  }

  const rawText = currentData?.message?.content || currentData?.response || '';

  let cleanJsonStr = rawText.trim();
  if (cleanJsonStr.startsWith('```')) {
    cleanJsonStr = cleanJsonStr.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  }

  return processResponseJson(cleanJsonStr, rawLibraryItems);
}
