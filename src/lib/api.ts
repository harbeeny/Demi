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
