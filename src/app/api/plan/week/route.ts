import { NextResponse } from "next/server";

import { loadContext } from "@/lib/plan/context";
import { preflight, withCors } from "@/lib/plan/cors";
import { generatePlan } from "@/lib/plan/generate";
import { prefsFromRow } from "@/lib/plan/rows";
import { isEligible } from "@/lib/plan/select-meals";
import { recentIdsFor, weekDates } from "@/lib/plan/week";
import { consumeQuota } from "@/lib/plan/quota";
import { fetchDeltasByDate } from "@/lib/log/adjustments";
import type { MealPlanEntry, MealSlot } from "@/lib/supabase/types";

// Up to two LLM personalize calls plus six deterministic generations.
export const maxDuration = 60;

/** Generate plans for the next 7 days, skipping days that already have one. */
async function post(request: Request): Promise<Response> {
  const ctx = await loadContext(request);
  if ("error" in ctx) return ctx.error;
  const { supabase, user, onboarding, meals } = ctx;

  const body = (await request.json().catch(() => ({}))) as { maxPrepMin?: number };
  const maxPrepMin =
    Number.isFinite(body.maxPrepMin) && Number(body.maxPrepMin) > 0
      ? Number(body.maxPrepMin)
      : undefined;

  // Fail fast when the prep cap leaves nothing to pick from.
  if (maxPrepMin !== undefined) {
    const prefs = { ...prefsFromRow(onboarding), maxPrepMin };
    if (!meals.some((m) => isEligible(m, prefs))) {
      return NextResponse.json(
        { error: `No meals fit under ${maxPrepMin} minutes with your preferences.` },
        { status: 409 },
      );
    }
  }

  const dates = weekDates(ctx.today);
  const { data: existing } = await supabase
    .from("meal_plans")
    .select("date, meals")
    .eq("user_id", user.id)
    .gte("date", new Date(Date.parse(dates[0]) - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
    .lte("date", dates[6]);

  const plansByDate = new Map<string, MealPlanEntry[]>(
    (existing ?? []).map((p) => [p.date, p.meals as MealPlanEntry[]]),
  );

  // Weekly balancing: days carrying a reduction plan smaller on purpose.
  const deltasByDate = await fetchDeltasByDate(supabase, user.id, dates);

  const generated: string[] = [];
  const skipped: string[] = [];

  // Sequential on purpose: each day's picks feed the next day's recency window.
  for (const [offset, date] of dates.entries()) {
    if (plansByDate.has(date)) {
      skipped.push(date);
      continue;
    }

    // LLM copy only for today and tomorrow: farther days go stale before they
    // arrive, and Regenerate restores the copy when the day comes. Meter each
    // personalize call; when the daily cap is hit, fall back to deterministic
    // copy for that day instead of failing the whole week.
    const personalizeWithLLM = offset <= 1 && (await consumeQuota(supabase, "llm"));

    const plan = await generatePlan(
      onboarding,
      meals,
      new Date(`${date}T12:00:00Z`),
      recentIdsFor(date, plansByDate),
      { maxPrepMin, personalizeWithLLM, kcalDelta: deltasByDate[date] ?? 0 },
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
        user_id: user.id,
        date,
        llm_rationale: plan.rationale.daySummary,
        meals: entries,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,date" },
    );

    if (saveError) {
      return NextResponse.json(
        { error: "Couldn't save the whole week.", generated, skipped },
        { status: 500 },
      );
    }

    plansByDate.set(date, entries);
    generated.push(date);
  }

  return NextResponse.json({ ok: true, generated, skipped });
}

export const POST = withCors(post);
export const OPTIONS = preflight("POST, OPTIONS");
