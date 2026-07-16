// Structured request telemetry. One JSON line per API request (Vercel's
// function logs ingest these as queryable structured logs), plus a central
// error capture every route error funnels through. No vendor dependency:
// when a Sentry DSN day comes, captureError is the single splice point.

export interface RequestLog {
  at: "api";
  route: string;
  method: string;
  status: number;
  ms: number;
  [key: string]: unknown;
}

/** Requests slower than this log as warnings so they stand out in filters. */
export const SLOW_REQUEST_MS = 3_000;

export function logRequest(entry: RequestLog): void {
  const line = JSON.stringify(entry);
  if (entry.status >= 500) console.error(line);
  else if (entry.status >= 400 || entry.ms >= SLOW_REQUEST_MS) console.warn(line);
  else console.log(line);
}

/**
 * Central error capture: structured console.error today (Vercel keeps the
 * stack), the future Sentry call lives here and nowhere else.
 */
export function captureError(err: unknown, context: Record<string, unknown> = {}): void {
  const detail =
    err instanceof Error
      ? { name: err.name, message: err.message, stack: err.stack }
      : { message: String(err) };
  console.error(JSON.stringify({ at: "error", ...context, ...detail }));
}

/** Route path for logs: strips origin and query (never log query values). */
export function routePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "unknown";
  }
}
