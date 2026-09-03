/**
 * Cloudflare Pages Function: /api/proxy
 * Handles external AI API requests (such as Ollama Cloud or Gemini endpoints)
 * when deployed on Cloudflare Pages without CORS limitations.
 *
 * Security: this endpoint is publicly reachable, so it is NOT a generic relay.
 * Only HTTPS POSTs to the allow-listed AI hosts below are forwarded; everything
 * else is rejected with 403 to prevent open-proxy/SSRF abuse. Only the caller's
 * Authorization header is forwarded — arbitrary header injection is not allowed.
 * The dev twin of this contract lives in vite.config.ts (localApiProxyPlugin).
 */

interface Env {}

const ALLOWED_TARGET_HOSTS = new Set([
  'ollama.com',
  'generativelanguage.googleapis.com'
]);

function isAllowedTarget(targetUrl: string): boolean {
  try {
    const url = new URL(targetUrl);
    return url.protocol === 'https:' && ALLOWED_TARGET_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

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

    if (!isAllowedTarget(targetUrl)) {
      return new Response(
        JSON.stringify({
          error: `Blocked: target host is not on the proxy allow-list (allowed: ${[...ALLOWED_TARGET_HOSTS].join(', ')})`
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      );
    }

    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (headers && typeof headers.Authorization === 'string' && headers.Authorization) {
      forwardHeaders['Authorization'] = headers.Authorization;
    }

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
