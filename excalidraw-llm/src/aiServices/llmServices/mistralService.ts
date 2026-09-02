import { processResponseJson } from '../utils/responseParser';
import { appLogger } from '../utils/logger';
import { getMistralDiagramOnlySystemInstruction } from '../utils/promptBuilder';

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
    } catch (proxyErr: any) {
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
