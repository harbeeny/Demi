import { createClient } from "@/lib/supabase/client";
import { addDaysISO } from "@/lib/log/balance";
import { localDateISO } from "@/lib/dates";
import { inferChainCounts } from "./chains";
import { parseRegion, type TakeoutRegion } from "./region";
import type { TakeoutPrefRow } from "./recommend";

/**
 * Supabase IO for the takeout preference layer. All reads and writes go
 * through the caller's own RLS-scoped client; every function is best-effort
 * (the sheet must keep working as a plain handoff when any of this fails).
 * Inference reads history the user already gave us (meal log names, past
 * takeout searches) instead of interrogating them: learn first, ask second.
 */

export interface TakeoutContext {
  prefs: TakeoutPrefRow[];
  inferredCounts: Record<string, number>;
  region: TakeoutRegion | null;
}

export async function loadTakeoutContext(): Promise<TakeoutContext> {
  const empty: TakeoutContext = { prefs: [], inferredCounts: {}, region: null };
  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return empty;

    const since = addDaysISO(localDateISO(), -90);
    const [{ data: prefRows }, { data: logRows }, { data: tapRows }, { data: profileRow }] =
      await Promise.all([
        supabase
          .from("user_takeout_prefs")
          .select("chain_name, affinity, source")
          .eq("user_id", user.id),
        supabase
          .from("meal_logs")
          .select("name")
          .eq("user_id", user.id)
          .gte("date", since)
          .limit(400),
        supabase
          .from("takeout_intent_events")
          .select("dish_query")
          .eq("user_id", user.id)
          .limit(200),
        supabase.from("profiles").select("takeout_region").eq("id", user.id).maybeSingle(),
      ]);

    return {
      prefs: (prefRows ?? []) as TakeoutPrefRow[],
      inferredCounts: inferChainCounts([
        ...(logRows ?? []).map((r) => r.name),
        ...(tapRows ?? []).map((r) => r.dish_query),
      ]),
      region: parseRegion(profileRow?.takeout_region ?? null),
    };
  } catch {
    return empty;
  }
}

export async function savePickedChains(ids: string[]): Promise<void> {
  await withUser(async (supabase, userId) => {
    if (ids.length === 0) return;
    await supabase.from("user_takeout_prefs").upsert(
      ids.map((chain_name) => ({
        user_id: userId,
        chain_name,
        affinity: "liked" as const,
        source: "picker" as const,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "user_id,chain_name" },
    );
  });
}

export async function setChainAffinity(
  chainName: string,
  change:
    | { affinity: "liked"; source: "picker" | "inferred" | "favorited" }
    | { affinity: "hidden"; source: "picker" | "inferred" | "favorited" }
    | "clear",
): Promise<void> {
  await withUser(async (supabase, userId) => {
    if (change === "clear") {
      await supabase
        .from("user_takeout_prefs")
        .delete()
        .eq("user_id", userId)
        .eq("chain_name", chainName);
      return;
    }
    await supabase.from("user_takeout_prefs").upsert(
      {
        user_id: userId,
        chain_name: chainName,
        affinity: change.affinity,
        source: change.source,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,chain_name" },
    );
  });
}

/** One coarse value, overwritten in place; null clears it. */
export async function saveRegion(region: TakeoutRegion | null): Promise<void> {
  await withUser(async (supabase, userId) => {
    await supabase.from("profiles").update({ takeout_region: region }).eq("id", userId);
  });
}

async function withUser(
  fn: (supabase: ReturnType<typeof createClient>, userId: string) => Promise<void>,
): Promise<void> {
  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) return;
    await fn(supabase, session.user.id);
  } catch {
    // best-effort: preference writes must never break the handoff
  }
}
