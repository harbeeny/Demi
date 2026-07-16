import { createClient } from "@/lib/supabase/client";

// Unset on the web build (same-origin /api/...); set to the Vercel origin in
// the Capacitor build, where the WebView's own origin has no API routes.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/**
 * fetch for our API routes: prefixes the cross-origin base when configured
 * and attaches the Supabase access token as a bearer header on every
 * platform. The web could rely on cookies alone, but sending the bearer
 * everywhere keeps one auth path continuously exercised.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const {
    data: { session },
  } = await createClient().auth.getSession();
  if (session) headers.set("authorization", `Bearer ${session.access_token}`);
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

/**
 * Wait for a queued plan build (POST /api/plan or /api/plan/week responded
 * 202 with a jobId). Polls the status endpoint, which also self-heals dead
 * runners, until the job reaches a terminal state or the deadline passes.
 */
export async function awaitPlanJob(
  jobId: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<{ ok: boolean; error?: string }> {
  const intervalMs = opts.intervalMs ?? 1500;
  const deadline = Date.now() + (opts.timeoutMs ?? 90_000);
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const res = await apiFetch(`/api/plan/job?id=${jobId}`);
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        error?: string | null;
      };
      if (data.status === "done") return { ok: true };
      if (data.status === "failed") {
        return { ok: false, error: data.error ?? "Plan generation failed. Try again." };
      }
    } catch {
      // transient poll failure: keep waiting until the deadline
    }
  }
  return { ok: false, error: "This is taking longer than usual. Pull to refresh in a moment." };
}
