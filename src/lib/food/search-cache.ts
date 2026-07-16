// No "server-only" guard: the pure TTL policy below is bun-tested, the
// module holds no secrets, and RLS is the real boundary either way (the
// tested estimate/label/reflect lib modules follow the same convention).
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

/**
 * L2 food-search cache in Postgres, behind the route's per-instance LRU.
 * Serverless memory caches evaporate on every cold start, so in production
 * most repeat searches were paying the 0.7-1.3s USDA round trip again; a
 * row read is ~50-100ms and survives instances, deploys, and devices.
 *
 * Per-user rows (RLS owner-scoped): search results feed macro logging, so
 * a shared cache would let one account poison nutrition data for others.
 * Both directions are best-effort; failures only cost an upstream fetch.
 */

/** Full results stay a week; USDA data moves slowly. */
export const HIT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Empty results expire fast: a product missing today (common right after
 * a barcode scan of something niche) may appear upstream tomorrow, and a
 * week-long negative cache would keep hiding it.
 */
export const MISS_TTL_MS = 24 * 60 * 60 * 1000;

export interface CachedSearch {
  foods: unknown[];
  correctedTo: string | null;
}

/** Which TTL applies to a payload: empty result sets age out sooner. */
export function ttlFor(payload: CachedSearch): number {
  return payload.foods.length > 0 ? HIT_TTL_MS : MISS_TTL_MS;
}

export async function searchCacheGet(
  supabase: SupabaseClient<Database>,
  userId: string,
  queryKey: string,
): Promise<CachedSearch | null> {
  const { data, error } = await supabase
    .from("food_search_cache")
    .select("payload, created_at")
    .eq("user_id", userId)
    .eq("query_key", queryKey)
    .single();
  if (error || !data) return null;
  const payload = data.payload as unknown as CachedSearch;
  if (!Array.isArray(payload?.foods)) return null;
  if (Date.now() - new Date(data.created_at).getTime() > ttlFor(payload)) return null;
  return payload;
}

export async function searchCachePut(
  supabase: SupabaseClient<Database>,
  userId: string,
  queryKey: string,
  payload: CachedSearch,
): Promise<void> {
  await supabase
    .from("food_search_cache")
    .upsert(
      {
        user_id: userId,
        query_key: queryKey,
        payload: JSON.parse(JSON.stringify(payload)),
        created_at: new Date().toISOString(),
      },
      { onConflict: "user_id,query_key" },
    );
}
