export async function onRequestPost(context: any) {
  try {
    const reqJson = await context.request.json();
    const { targetUrl, body, headers: customHeaders } = reqJson;

    if (!targetUrl) {
      return new Response(JSON.stringify({ error: 'Missing targetUrl parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(customHeaders || {})
      },
      body: JSON.stringify(body)
    });

    const responseData = await response.text();
    return new Response(responseData, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Proxy fetch failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}
