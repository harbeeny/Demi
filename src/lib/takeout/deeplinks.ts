import type { TakeoutProvider } from "@/lib/supabase/types";

/**
 * Search deep links into the delivery apps, for the takeout fake-door.
 * Plain HTTPS universal links on purpose: they open the native app when
 * installed and fall back to the provider's web search, while the custom
 * doordash:// and ubereats:// schemes are undocumented and break without
 * notice. These URL shapes are still not official APIs; treat them as
 * brittle, keep the builder under test, and route every navigation through
 * the homepage fallback in open.ts.
 */

export const TAKEOUT_PROVIDERS: Array<{ id: TakeoutProvider; label: string }> = [
  { id: "doordash", label: "DoorDash" },
  { id: "ubereats", label: "Uber Eats" },
];

/** Stable landing pages, the fallback when a search link fails to open. */
export const PROVIDER_HOMEPAGES: Record<TakeoutProvider, string> = {
  doordash: "https://www.doordash.com/",
  ubereats: "https://www.ubereats.com/",
};

export function buildTakeoutSearchUrl(
  provider: TakeoutProvider,
  dishQuery: string,
  geo?: { lat: number; lng: number },
): string {
  const q = encodeURIComponent(dishQuery.trim());
  switch (provider) {
    case "doordash":
      // DoorDash resolves against the account's saved delivery address;
      // geo is not reliably honored via query params.
      return `https://www.doordash.com/search/store/${q}/`;
    case "ubereats": {
      // Uber Eats honors a `pl` (place) param when provided; otherwise it
      // also uses the account's saved address.
      const base = `https://www.ubereats.com/search?q=${q}`;
      return geo
        ? `${base}&pl=${encodeURIComponent(
            JSON.stringify({ latitude: geo.lat, longitude: geo.lng }),
          )}`
        : base;
    }
  }
}
