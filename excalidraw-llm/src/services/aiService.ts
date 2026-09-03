import { convertToExcalidrawElements } from '@excalidraw/excalidraw';
import { GoogleGenAI, Type } from '@google/genai';
import { hydrateSkeletonsWithLibrary, sanitizeSkeletonsForExcalidraw } from '../utils/libraryIndexer';
import { repairAndParseJson } from '../utils/jsonRepair';
import { webMcpTools } from './webMcpService';
import { getSystemInstruction, stripMarkdown } from '../aiServices/prompts';
import { extractJsonPayload } from '../aiServices/parse';

export interface AIDiagramResult {
  chatReply: string;
  elements: any[];
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
  const finalElements = [...convertedStandard, ...hydratedElements];

  return {
    chatReply,
    elements: finalElements
  };
}

function normalizeGeminiModel(modelName: string): string {
  const trimmed = (modelName || '').trim();
  if (!trimmed || trimmed.includes('native-audio')) {
    return 'gemini-2.5-flash';
  }
  return trimmed;
}

export async function generateDiagramFromPrompt(
  prompt: string,
  apiKey: string,
  modelName: string = 'gemini-2.5-flash',
  rawLibraryItems: any[] = []
): Promise<AIDiagramResult> {
  if (!apiKey) {
    throw new Error('Gemini API key is required. Please set your API key in the settings (⚙️) panel.');
  }

  const systemInstruction = getSystemInstruction(rawLibraryItems);
  const primaryModel = normalizeGeminiModel(modelName);

  const candidateModels = Array.from(new Set([
    primaryModel,
    'gemini-3.1-flash-lite',
  ]));

  const functionDeclarations = webMcpTools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: {
      type: Type.OBJECT,
      properties: t.inputSchema.properties || {},
      required: (t.inputSchema.required as string[]) || []
    }
  }));

  let lastError: Error | null = null;
  const ai = new GoogleGenAI({ apiKey });

  for (const targetModel of candidateModels) {
    try {
      console.log(`[Gemini AI] Requesting diagram generation from model: ${targetModel}`);
      const contents: any[] = [{ role: 'user', parts: [{ text: prompt }] }];

      let response = await ai.models.generateContent({
        model: targetModel,
        contents,
        config: {
          systemInstruction,
          temperature: 0.2,
          maxOutputTokens: 8192,
          tools: (functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined) as any
        }
      });

      // Handle function calls triggered by Gemini
      if (response.functionCalls && response.functionCalls.length > 0) {
        console.log('[Gemini AI] Model triggered function calls:', response.functionCalls);

        for (const call of response.functionCalls) {
          const tool = webMcpTools.find((t) => t.name === call.name);
          let toolResult: any = { error: `Tool "${call.name}" not found` };
          if (tool) {
            toolResult = await tool.execute(call.args || {});
          }

          contents.push({
            role: 'model',
            parts: [{ functionCall: { name: call.name, args: call.args || {} } }]
          });
          contents.push({
            role: 'user',
            parts: [{
              functionResponse: {
                name: call.name,
                response: toolResult
              }
            }]
          });
        }

        response = await ai.models.generateContent({
          model: targetModel,
          contents,
          config: {
            systemInstruction,
            temperature: 0.2,
            maxOutputTokens: 8192
          }
        });
      }

      const rawText = typeof response?.text === 'string' ? response.text : '';
      let cleanJsonStr = rawText.trim();
      if (!cleanJsonStr) {
        continue;
      }
      if (cleanJsonStr.startsWith('```')) {
        cleanJsonStr = cleanJsonStr.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
      }

      return processResponseJson(cleanJsonStr, rawLibraryItems);
    } catch (err: any) {
      console.warn(`[Gemini AI] Model ${targetModel} failed, trying next candidate:`, err?.message);
      lastError = err;
    }
  }

  throw new Error(`Gemini API Error: ${lastError?.message || 'Failed to generate diagram.'}`);
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

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey.trim()) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
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

  const data = await response.json();

  // Check if Ollama model invoked tool_calls
  if (data?.message?.tool_calls && Array.isArray(data.message.tool_calls) && data.message.tool_calls.length > 0) {
    console.log('[Ollama] Model invoked tool_calls:', data.message.tool_calls);
    messages.push(data.message);

    for (const call of data.message.tool_calls) {
      const fnName = call?.function?.name;
      const fnArgs = typeof call?.function?.arguments === 'string'
        ? JSON.parse(call.function.arguments)
        : (call?.function?.arguments || {});

      const tool = webMcpTools.find((t) => t.name === fnName);
      let toolResult: any = { error: `Tool "${fnName}" not found` };
      if (tool) {
        toolResult = await tool.execute(fnArgs);
      }

      messages.push({
        role: 'tool',
        content: JSON.stringify(toolResult)
      });
    }

    const followUpBody = {
      model: cleanModel,
      messages,
      format: 'json',
      stream: false
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
      const followUpData = await followUpResponse.json();
      const followUpText = followUpData?.message?.content || followUpData?.response || '';
      let clean = followUpText.trim();
      if (clean.startsWith('```')) {
        clean = clean.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
      }
      return processResponseJson(clean, rawLibraryItems);
    }
  }

  const rawText = data?.message?.content || data?.response || '';

  let cleanJsonStr = rawText.trim();
  if (cleanJsonStr.startsWith('```')) {
    cleanJsonStr = cleanJsonStr.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  }

  return processResponseJson(cleanJsonStr, rawLibraryItems);
}
