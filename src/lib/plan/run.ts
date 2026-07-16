import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, MealPlanEntry, MealSlot } from "@/lib/supabase/types";
import { generatePlan } from "./generate";
import { prefsFromRow } from "./rows";
import { isEligible, type Meal } from "./select-meals";
import { recentIdsFor, weekDates } from "./week";
import { consumeQuota, llmEnabled } from "./quota";
import { withUsageMeter } from "@/lib/ai/meter";
import { dbPhrasingCache } from "./phrasing-cache";
import { fetchDayDelta, fetchDeltasByDate } from "@/lib/log/adjustments";

/**
 * The generation bodies that used to live inline in POST /api/plan and
 * POST /api/plan/week, extracted so the job worker can run them after the
 * response. Behavior is identical; only the transport moved.
 */

export interface RunDeps {
  supabase: SupabaseClient<Database>;
  userId: string;
  onboarding: Database["public"]["Tables"]["onboarding_answers"]["Row"];
  meals: Meal[];
  today: string;
  /** clock preference from profiles.prefers_24h_time; null means 12-hour */
  prefers24h: boolean | null;
}

export type RunResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      /** true = retrying can't help (quota exhausted); fail immediately */
      permanent?: boolean;
    };

export interface PlanJobPayload {
  regenerate?: boolean;
  maxPrepMin?: number;
}

export async function runPlanJob(deps: RunDeps, payload: PlanJobPayload): Promise<RunResult> {
  const { supabase, userId, onboarding, meals, today, prefers24h } = deps;

  // Variety: avoid repeating yesterday's meals, and on regenerate, today's
  // current picks.
  const { data: recentPlans } = await supabase
    .from("meal_plans")
    .select("date, meals")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(2);

  // Idempotency inside the worker too (the route also short-circuits):
  // a duplicate queued job must not bill a second generation.
  const todaysPlan = (recentPlans ?? []).find((p) => p.date === today);
  if (todaysPlan && !payload.regenerate) return { ok: true };

  // Kill switch: plans still generate (selection is deterministic), the
  // copy just falls back to free deterministic phrasing.
  const llmOn = await llmEnabled(supabase);

  if (llmOn && !(await consumeQuota(supabase, "llm"))) {
    return {
      ok: false,
      permanent: true,
      error: "You've reached today's limit for generated suggestions. It resets tomorrow.",
    };
  }

  const recentlyUsedIds = (recentPlans ?? []).flatMap((p) =>
    (p.meals as MealPlanEntry[]).map((m) => m.meal_id),
  );

  // Weekly balancing can shrink today's budget; the plan should honor it.
  const kcalDelta = await fetchDayDelta(supabase, userId, today);

  const plan = await withUsageMeter({ supabase, userId, kind: "plan" }, () =>
    generatePlan(onboarding, meals, new Date(), recentlyUsedIds, {
      maxPrepMin: payload.maxPrepMin,
      kcalDelta,
      personalizeWithLLM: llmOn,
      phrasingCache: dbPhrasingCache(supabase, userId),
      prefers24h,
    }),
  );

  const entries: MealPlanEntry[] = plan.slots.map((s) => ({
    meal_id: s.mealId,
    slot: s.slot as MealSlot,
    servings: 1,
    time_hour: s.timeHour,
    why: s.why,
  }));

  const { data: saved, error: saveError } = await supabase
    .from("meal_plans")
    .upsert(
      {
        user_id: userId,
        date: today,
        llm_rationale: plan.rationale.daySummary,
        meals: entries,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,date" },
    )
    .select("id")
    .single();

  if (saveError || !saved) return { ok: false, error: "Couldn't save the plan." };

  if (payload.regenerate) {
    await supabase.from("plan_events").insert({
      user_id: userId,
      plan_id: saved.id,
      event: "regenerated",
    });
  }

  return { ok: true };
}

export async function runWeekJob(
  deps: RunDeps,
  payload: { maxPrepMin?: number },
): Promise<RunResult> {
  const { supabase, userId, onboarding, meals, today, prefers24h } = deps;
  const maxPrepMin = payload.maxPrepMin;

  const dates = weekDates(today);
  const { data: existing } = await supabase
    .from("meal_plans")
    .select("date, meals")
    .eq("user_id", userId)
    .gte(
      "date",
      new Date(Date.parse(dates[0]) - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    )
    .lte("date", dates[6]);

  const plansByDate = new Map<string, MealPlanEntry[]>(
    (existing ?? []).map((p) => [p.date, p.meals as MealPlanEntry[]]),
  );

  // Weekly balancing: days carrying a reduction plan smaller on purpose.
  const deltasByDate = await fetchDeltasByDate(supabase, userId, dates);

  // One kill-switch read for the whole week build.
  const llmOn = await llmEnabled(supabase);

  // Sequential on purpose: each day's picks feed the next day's recency window.
  for (const [offset, date] of dates.entries()) {
    if (plansByDate.has(date)) continue;

    // LLM copy only for today and tomorrow: farther days go stale before they
    // arrive, and Regenerate restores the copy when the day comes. Meter each
    // personalize call; when the daily cap is hit (or the kill switch is on),
    // fall back to deterministic copy for that day instead of failing the week.
    const personalizeWithLLM = offset <= 1 && llmOn && (await consumeQuota(supabase, "llm"));

    const plan = await withUsageMeter({ supabase, userId, kind: "week" }, () =>
      generatePlan(onboarding, meals, new Date(`${date}T12:00:00Z`), recentIdsFor(date, plansByDate), {
        maxPrepMin,
        personalizeWithLLM,
        kcalDelta: deltasByDate[date] ?? 0,
        phrasingCache: dbPhrasingCache(supabase, userId),
        prefers24h,
      }),
    );

    const entries: MealPlanEntry[] = plan.slots.map((s) => ({
      meal_id: s.mealId,
      slot: s.slot as MealSlot,
      servings: 1,
      time_hour: s.timeHour,
      why: s.why,
    }));

    const { error: saveError } = await supabase.from("meal_plans").upsert(
      {
        user_id: userId,
        date,
        llm_rationale: plan.rationale.daySummary,
        meals: entries,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,date" },
    );

    // Retryable: the already-saved days are skipped on the next attempt.
    if (saveError) return { ok: false, error: "Couldn't save the whole week." };

    plansByDate.set(date, entries);
  }

  return { ok: true };
}

/** Sync pre-check kept in the route: a prep cap that excludes every meal. */
export function weekPrepCapViable(
  onboarding: RunDeps["onboarding"],
  meals: Meal[],
  maxPrepMin: number | undefined,
): boolean {
  if (maxPrepMin === undefined) return true;
  const prefs = { ...prefsFromRow(onboarding), maxPrepMin };
  return meals.some((m) => isEligible(m, prefs));
}
