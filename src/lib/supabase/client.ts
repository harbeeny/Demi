import { createBrowserClient } from "@supabase/ssr";
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";

import type { Database } from "./types";

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Missing Supabase configuration. Copy .env.example to .env.local and add your project values.",
    );
  }

  return { url, publishableKey };
}

let client: SupabaseClient<Database> | undefined;

/**
 * Browser-side client, platform-aware. On the web it keeps the cookie-backed
 * @supabase/ssr client (middleware and the auth/confirm route read those
 * cookies). Inside the Capacitor WebView there is no server, so sessions live
 * in localStorage and magic-link URL detection is off (login is 6-digit OTP).
 * Singleton: plain supabase-js does not dedupe GoTrue instances itself.
 */
export function createClient(): SupabaseClient<Database> {
  if (client) return client;
  const { url, publishableKey } = getSupabaseConfig();

  client = Capacitor.isNativePlatform()
    ? createSupabaseClient<Database>(url, publishableKey, {
        auth: {
          storage: window.localStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : createBrowserClient<Database>(url, publishableKey);

  return client;
}
