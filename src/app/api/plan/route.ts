import { NextResponse } from "next/server";

import { generatePlan } from "@/lib/plan/generate";
import { loadContext, todayISO } from "@/lib/plan/context";
import { scoreMeal, isEligible } from "@/lib/plan/select-meals";
import { distribute, targets } from "@/lib/nutrition";
import { profileFromRow, prefsFromRow } from "@/lib/plan/generate";
import type { MealPlanEntry, MealSlot } from "@/lib/supabase/types";
import { preflight, withCors } from "@/lib/plan/cors";
import { consumeQuota, quotaExceeded } from "@/lib/plan/quota";

/** Generate (or regenerate) today's plan. */
async function post(request: Request): Promise<Response> {
  const ctx = await loadContext(request);
  if ("error" in ctx) return ctx.error;
  const { supabase, user, onboarding, meals } = ctx;

  const body = (await request.json().catch(() => ({}))) as {
    regenerate?: boolean;
    maxPrepMin?: number;
  };
  const maxPrepMin =
    Number.isFinite(body.maxPrepMin) && Number(body.maxPrepMin) > 0
      ? Number(body.maxPrepMin)
      : undefined;
  const date = todayISO();

  // Variety: avoid repeating yesterday's meals, and on regenerate, today's current picks.
  const { data: recentPlans } = await supabase
    .from("meal_plans")
    .select("date, meals")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(2);

  // Idempotency: today's plan already exists and this isn't an explicit
  // regenerate, so return it without spending an LLM call. Without this a
  // client could loop POST /api/plan and bill a fresh generation each time.
  const todaysPlan = (recentPlans ?? []).find((p) => p.date === date);
  if (todaysPlan && !body.regenerate) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  // This path runs the paid personalize() generation; meter it per user.
  if (!(await consumeQuota(supabase, "llm"))) {
    return quotaExceeded("llm");
  }

  const recentlyUsedIds = (recentPlans ?? []).flatMap((p) =>
    (p.meals as MealPlanEntry[]).map((m) => m.meal_id),
  );

  const plan = await generatePlan(onboarding, meals, new Date(), recentlyUsedIds, { maxPrepMin });

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
        user_id: user.id,
        date,
        llm_rationale: plan.rationale.daySummary,
        meals: entries,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,date" },
    )
    .select("id")
    .single();

  if (saveError || !saved) {
    return NextResponse.json({ error: "Couldn't save the plan." }, { status: 500 });
  }

  if (body.regenerate) {
    await supabase.from("plan_events").insert({
      user_id: user.id,
      plan_id: saved.id,
      event: "regenerated",
    });
  }

  return NextResponse.json({ ok: true });
}

/** Swap one meal slot for the next-best alternative. */
async function patch(request: Request): Promise<Response> {
  const ctx = await loadContext(request);
  if ("error" in ctx) return ctx.error;
  const { supabase, user, onboarding, meals } = ctx;

  const body = (await request.json().catch(() => ({}))) as { slotIndex?: number };
  if (typeof body.slotIndex !== "number") {
    return NextResponse.json({ error: "slotIndex is required." }, { status: 400 });
  }

  const date = todayISO();
  const { data: planRow } = await supabase
    .from("meal_plans")
    .select("id, meals")
    .eq("user_id", user.id)
    .eq("date", date)
    .single();

  if (!planRow) {
    return NextResponse.json({ error: "No plan for today yet." }, { status: 404 });
  }

  const entries = planRow.meals as MealPlanEntry[];
  const entry = entries[body.slotIndex];
  if (!entry) {
    return NextResponse.json({ error: "Invalid slot index." }, { status: 400 });
  }

  // Rebuild this slot's macro target so the replacement still fits the day.
  const profile = profileFromRow(onboarding);
  const slotTargets = distribute(targets(profile), profile, new Date());
  const slotTarget = slotTargets[body.slotIndex] ?? slotTargets[0];

  const usedIds = new Set(entries.map((e) => e.meal_id));
  const prefs = prefsFromRow(onboarding);
  const candidates = meals
    .filter((m) => isEligible(m, prefs) && !usedIds.has(m.id))
    .filter((m) => m.tags.includes(entry.slot))
    .sort((a, b) => scoreMeal(a, slotTarget) - scoreMeal(b, slotTarget));

  const replacement = candidates[0];
  if (!replacement) {
    return NextResponse.json({ error: "No alternative meals fit this slot." }, { status: 409 });
  }

  entries[body.slotIndex] = {
    ...entry,
    meal_id: replacement.id,
    why: `Swapped in ${replacement.name}: closest fit for your ${entry.slot} target that you haven't already got today.`,
  };

  const { error: updateError } = await supabase
    .from("meal_plans")
    .update({ meals: entries })
    .eq("id", planRow.id);

  if (updateError) {
    return NextResponse.json({ error: "Couldn't save the swap." }, { status: 500 });
  }

  await supabase.from("plan_events").insert({
    user_id: user.id,
    plan_id: planRow.id,
    event: "swapped",
    meal_slot: entry.slot,
  });

  return NextResponse.json({ ok: true });
}

export const POST = withCors(post);
export const PATCH = withCors(patch);
export const OPTIONS = preflight("POST, PATCH, OPTIONS");
