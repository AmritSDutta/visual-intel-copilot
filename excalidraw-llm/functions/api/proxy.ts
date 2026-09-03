/**
 * Cloudflare Pages Function: /api/proxy
 * Handles external AI API requests (such as Ollama Cloud or Gemini endpoints)
 * when deployed on Cloudflare Pages without CORS limitations.
 */

interface Env {}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  try {
    const { targetUrl, body, headers } = (await context.request.json()) as {
      targetUrl: string;
      body?: any;
      headers?: Record<string, string>;
    };

    if (!targetUrl || typeof targetUrl !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing or invalid targetUrl' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(headers || {})
    };

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: forwardHeaders,
      body: JSON.stringify(body || {})
    });

    const data = await response.text();

    return new Response(data, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || 'Cloudflare edge proxy failed' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}
