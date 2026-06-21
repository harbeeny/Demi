import { createBrowserClient } from "@supabase/ssr";

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

/**
 * Creates the browser-side client used by future auth, profile, and chat-history
 * features. The publishable key is intentionally safe to expose to the browser;
 * row-level security will protect user data when tables are added.
 */
export function createClient() {
  const { url, publishableKey } = getSupabaseConfig();

  return createBrowserClient(url, publishableKey);
}
