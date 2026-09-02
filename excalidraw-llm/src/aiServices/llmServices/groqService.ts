import { getGroqTextOnlySystemInstruction, stripMarkdown } from '../utils/promptBuilder';
import { GROQ_MODELS, type AIDiagramResult } from '../core/types';
export { GROQ_MODELS };

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
      } catch (proxyErr: any) {
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

/**
 * Fallback combined diagram generator if called directly.
 */
export async function generateDiagramWithGroq(
  prompt: string,
  apiKey: string,
  modelName: string = 'llama-3.3-70b-versatile',
  _rawLibraryItems: any[] = []
): Promise<AIDiagramResult> {
  const textReply = await generateTextExplanationWithGroq(prompt, apiKey, modelName);
  return {
    chatReply: textReply,
    elements: []
  };
}
