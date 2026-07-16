import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

/**
 * Summed day_adjustments kcal deltas for a set of dates (negative =
 * reduction). RLS scopes rows to the caller; userId narrows explicitly for
 * clarity like every other query in the app.
 */
export async function fetchDeltasByDate(
  supabase: SupabaseClient<Database>,
  userId: string,
  dates: string[],
): Promise<Record<string, number>> {
  if (dates.length === 0) return {};
  const { data } = await supabase
    .from("day_adjustments")
    .select("date, kcal_delta")
    .eq("user_id", userId)
    .in("date", dates);
  const byDate: Record<string, number> = {};
  for (const row of data ?? []) {
    byDate[row.date] = (byDate[row.date] ?? 0) + Number(row.kcal_delta);
  }
  return byDate;
}

export async function fetchDayDelta(
  supabase: SupabaseClient<Database>,
  userId: string,
  date: string,
): Promise<number> {
  const byDate = await fetchDeltasByDate(supabase, userId, [date]);
  return byDate[date] ?? 0;
}
