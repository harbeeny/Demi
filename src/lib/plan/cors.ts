// CORS for API routes called cross-origin by the Capacitor shell.
// Allowlist-based (never *): the iOS WebView origin plus localhost for the
// static-export regression rig. Same-origin web requests carry no matching
// Origin header, so every helper here is a no-op for the existing site.

const ALLOWED_ORIGINS = new Set([
  "capacitor://localhost",
  "http://localhost:3000",
]);

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
}

/** Build a per-route OPTIONS handler, e.g. OPTIONS = preflight("POST, OPTIONS"). */
export function preflight(methods: string) {
  return (request: Request) =>
    new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(request),
        "Access-Control-Allow-Methods": methods,
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Max-Age": "86400",
      },
    });
}

/**
 * Wrap a handler so every response, including loadContext 401s and error
 * paths, carries CORS headers the WebView is allowed to read.
 */
export function withCors<A extends unknown[]>(
  handler: (request: Request, ...args: A) => Promise<Response>,
) {
  return async (request: Request, ...args: A) => {
    const res = await handler(request, ...args);
    for (const [k, v] of Object.entries(corsHeaders(request))) {
      res.headers.set(k, v);
    }
    return res;
  };
}
