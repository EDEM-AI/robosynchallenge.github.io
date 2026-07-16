export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "*";
    const corsHeaders = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (!env.APPS_SCRIPT_URL) {
      return json({ ok: false, error: "APPS_SCRIPT_URL is not configured." }, 500, corsHeaders);
    }

    const upstream = await fetch(env.APPS_SCRIPT_URL, {
      method: request.method,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: request.method === "GET" ? undefined : await request.text(),
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
    });
  },
};

function json(value, status, headers) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
