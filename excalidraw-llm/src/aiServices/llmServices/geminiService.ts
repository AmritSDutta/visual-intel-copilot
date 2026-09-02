import { GoogleGenAI } from '@google/genai';
import { getSystemInstruction } from '../utils/promptBuilder';
import { processResponseJson } from '../utils/responseParser';
import type { AIDiagramResult } from '../core/types';

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
