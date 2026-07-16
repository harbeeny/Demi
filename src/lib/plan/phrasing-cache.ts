import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import type { PersonalizedPlan } from "@/lib/ai/personalize";
import type { PhrasingCache } from "./generate";

/**
 * plan_cache-backed phrasing cache. Rows are per-user (RLS owner-scoped) on
 * purpose: a shared cache would let one account poison copy served to
 * others. Both sides are best-effort; failures cost a model call, nothing
 * else. Entries are content-addressed by prompt hash, so there is no
 * invalidation problem: changed inputs simply stop hitting the old key.
 */
export function dbPhrasingCache(
  supabase: SupabaseClient<Database>,
  userId: string,
): PhrasingCache {
  return {
    async load(key) {
      const { data, error } = await supabase
        .from("plan_cache")
        .select("payload")
        .eq("user_id", userId)
        .eq("key", key)
        .single();
      if (error || !data) return null;
      const plan = data.payload as unknown as PersonalizedPlan;
      // Shape check at the trust boundary: rows are user-owned, so treat
      // them like any client input before serving them back as copy.
      if (typeof plan?.daySummary !== "string" || !Array.isArray(plan?.meals)) return null;
      return { ...plan, fallbackUsed: false };
    },
    async save(key, plan) {
      // Content-addressed: an existing row for this key holds identical
      // copy, so DO NOTHING beats an update (and needs no UPDATE policy).
      await supabase
        .from("plan_cache")
        .upsert(
          { user_id: userId, key, payload: JSON.parse(JSON.stringify(plan)) },
          { onConflict: "user_id,key", ignoreDuplicates: true },
        );
    },
  };
}
