import { captureError, logRequest, routePath } from "@/lib/obs";

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
 * paths, carries CORS headers the WebView is allowed to read. Doubles as
 * the telemetry choke point: one structured log line per request, and any
 * uncaught handler error is captured and answered with a generic 500
 * instead of leaking a stack through the platform's default error page.
 */
export function withCors<A extends unknown[]>(
  handler: (request: Request, ...args: A) => Promise<Response>,
) {
  return async (request: Request, ...args: A) => {
    const started = Date.now();
    const route = routePath(request.url);
    let res: Response;
    try {
      res = await handler(request, ...args);
    } catch (err) {
      captureError(err, { route, method: request.method });
      res = new Response(JSON.stringify({ error: "Something went wrong." }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
    logRequest({
      at: "api",
      route,
      method: request.method,
      status: res.status,
      ms: Date.now() - started,
    });
    for (const [k, v] of Object.entries(corsHeaders(request))) {
      res.headers.set(k, v);
    }
    return res;
  };
}
