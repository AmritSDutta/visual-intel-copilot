/**
 * Cloudflare Pages Function: /api/log
 * Gracefully receives client telemetry / stdio logs on Cloudflare Edge.
 */

interface Env {}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  try {
    const payload = await context.request.json();
    console.log('[CLIENT_LOG]', JSON.stringify(payload));
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
