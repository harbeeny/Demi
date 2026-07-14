// Week-planning date math. Pure and client-importable. All dates are UTC ISO
// (YYYY-MM-DD), the same toISOString().slice(0,10) convention as todayISO();
// mixing local dates here would double-plan or skip days.

import type { MealPlanEntry } from "@/lib/supabase/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** [today, today+1, ..., today+6] */
export function weekDates(todayIso: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(todayIso, i));
}

/**
 * The recency window for generating `date`: meal ids from the plans of the
 * previous two days. The map mixes rows loaded from the DB with days
 * generated earlier in the same batch, which is what keeps variety across
 * a freshly planned week.
 */
export function recentIdsFor(
  dateIso: string,
  plansByDate: Map<string, MealPlanEntry[]>,
): string[] {
  const ids: string[] = [];
  for (const offset of [1, 2]) {
    const entries = plansByDate.get(addDays(dateIso, -offset));
    if (entries) ids.push(...entries.map((e) => e.meal_id));
  }
  return ids;
}
