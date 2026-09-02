import { GoogleGenAI } from '@google/genai';
import {
  getSystemInstruction,
  getGroqTextOnlySystemInstruction,
  getMistralDiagramOnlySystemInstruction,
  stripMarkdown
} from './prompts';
import { processResponseJson } from './parse';
import { appLogger } from './logger';
import type { AIDiagramResult } from './types';

// ─────────────────────────────────────────────────────────────
// Gemini (diagram + text fallback provider)
// ─────────────────────────────────────────────────────────────

export function normalizeGeminiModel(modelName: string): string {
  const trimmed = (modelName || '').trim();
  if (!trimmed || trimmed.includes('native-audio') || trimmed.includes('preview')) {
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
    'gemini-2.5-flash',
    'gemini-3.1-flash-lite'
  ]));

  let lastError: Error | null = null;
  const ai = new GoogleGenAI({ apiKey });

  for (const targetModel of candidateModels) {
    try {
      console.log(`[Gemini AI] Requesting diagram generation from model: ${targetModel}`);
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

// ─────────────────────────────────────────────────────────────
// Groq (fast text explanation provider)
// ─────────────────────────────────────────────────────────────

/**
 * ⚡ Generates ONLY the architectural text explanation via Groq LPU (~300ms, sub-second).
 */
export async function generateTextExplanationWithGroq(
  prompt: string,
  apiKey: string,
  modelName: string = 'groq/compound',
  canvasTopologyText?: string
): Promise<string> {
  if (!apiKey?.trim()) {
    throw new Error('Groq API Key is required for fast text generation.');
  }

  const primaryModel = modelName.trim() || 'groq/compound';
  const systemInstruction = getGroqTextOnlySystemInstruction(canvasTopologyText);
  const url = 'https://api.groq.com/openai/v1/chat/completions';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey.trim()}`
  };

  const candidateModels = Array.from(new Set([
    primaryModel,
    'groq/compound',
    'groq/compound-mini',
    'qwen/qwen3.8-27b',
    'openai/gpt-oss-120b'
  ]));

  let lastError: Error | null = null;

  for (const targetModel of candidateModels) {
    const requestBody = {
      model: targetModel,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 1500
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });
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
        lastError = new Error(`Failed to reach Groq API: ${err?.message || 'Network error'}`);
        continue;
      }
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      lastError = new Error(`Groq API Error (${response.status}): ${errText || response.statusText}`);
      continue;
    }

    const data = await response.json();
    const rawText = data?.choices?.[0]?.message?.content || '';
    if (rawText.trim()) {
      return stripMarkdown(rawText.trim());
    }
  }

  throw lastError || new Error('Groq text explanation generation failed across candidate models.');
}

// ─────────────────────────────────────────────────────────────
// Mistral (diagram elements provider)
// ─────────────────────────────────────────────────────────────

export class MistralTierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MistralTierError';
  }
}

export async function generateDiagramElementsWithMistral(
  userPrompt: string,
  apiKey: string,
  model: string = 'mistral-small-latest',
  libraryItems: unknown[] = [],
  existingTopologyGraphText?: string
): Promise<any[]> {
  const effectiveModel = model?.trim() || 'mistral-small-latest';
  const t0 = Date.now();

  const systemPrompt = getMistralDiagramOnlySystemInstruction(libraryItems, existingTopologyGraphText);

  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Create architectural Excalidraw vector elements for: "${userPrompt}".`
    }
  ];

  const payload = {
    model: effectiveModel,
    messages,
    temperature: 0.2,
    max_tokens: 3000,
    response_format: { type: 'json_object' }
  };

  const url = 'https://api.mistral.ai/v1/chat/completions';
  const headers = {
    Authorization: `Bearer ${apiKey.trim()}`,
    'Content-Type': 'application/json'
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  } catch (err: any) {
    try {
      response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl: url,
          headers,
          body: payload
        })
      });
    } catch {
      throw new Error(`Failed to reach Mistral API: ${err?.message || 'Network error'}`);
    }
  }

  if (!response.ok) {
    const errText = await response.text();
    if (response.status === 403) {
      appLogger.warn('MISTRAL', `Mistral API 403 (Tier not allowed for ${effectiveModel})`);
      throw new MistralTierError(`Mistral 403: Model ${effectiveModel} is not permitted on this API key tier.`);
    }
    appLogger.error('MISTRAL', `Mistral API error (${response.status}): ${errText}`);
    throw new Error(`Mistral API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content || '';

  const parsed = processResponseJson(rawContent, libraryItems as any[]);
  const elements = parsed.elements || [];

  appLogger.info('MISTRAL', `🦔 Mistral (${effectiveModel}) generated ${elements.length} elements in ${Date.now() - t0}ms`);
  return elements;
}
