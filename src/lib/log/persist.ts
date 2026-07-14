import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import { rollupTotals } from "./rollup";

type Client = SupabaseClient<Database>;

/**
 * Recompute the daily rollup from meal_logs and upsert daily_logs.
 * Every log mutation reopens the day: a stale reflection must not outlive
 * the logs it described, so finished_at/reflection/tweak are cleared unless
 * the caller is the finish-day route writing fresh ones.
 */
export async function syncDailyRollup(
  supabase: Client,
  userId: string,
  date: string,
  extra?: Partial<Database["public"]["Tables"]["daily_logs"]["Insert"]>,
): Promise<{ error: string | null }> {
  const { data: logs, error: readError } = await supabase
    .from("meal_logs")
    .select("kcal, protein_g, carbs_g, fat_g")
    .eq("user_id", userId)
    .eq("date", date);

  if (readError) return { error: "Couldn't read today's logs." };

  const totals = rollupTotals(
    (logs ?? []).map((l) => ({
      kcal: Number(l.kcal),
      proteinG: Number(l.protein_g),
      carbsG: Number(l.carbs_g),
      fatG: Number(l.fat_g),
    })),
  );

  const { error: writeError } = await supabase.from("daily_logs").upsert(
    {
      user_id: userId,
      date,
      ...totals,
      // Reopen the day by default; finish-day overrides with fresh values.
      finished_at: null,
      reflection: null,
      tweak: null,
      ...extra,
    },
    { onConflict: "user_id,date" },
  );

  if (writeError) return { error: "Couldn't save today's totals." };
  return { error: null };
}
