import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { generatePlan } from "@/lib/plan/generate";
import { scoreMeal, isEligible, type Meal } from "@/lib/plan/select-meals";
import { distribute, targets } from "@/lib/nutrition";
import { profileFromRow, prefsFromRow } from "@/lib/plan/generate";
import type { MealPlanEntry, MealSlot } from "@/lib/supabase/types";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function loadContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };

  const { data: onboarding } = await supabase
    .from("onboarding_answers")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!onboarding) {
    return { error: NextResponse.json({ error: "Finish onboarding first." }, { status: 400 }) };
  }

  const { data: meals } = await supabase.from("meals").select("*");
  if (!meals || meals.length === 0) {
    return { error: NextResponse.json({ error: "Meal database is empty." }, { status: 500 }) };
  }

  return { supabase, user, onboarding, meals: meals as Meal[] };
}

/** Generate (or regenerate) today's plan. */
export async function POST(request: Request) {
  const ctx = await loadContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, user, onboarding, meals } = ctx;

  const body = (await request.json().catch(() => ({}))) as { regenerate?: boolean };
  const date = todayISO();

  // Variety: avoid repeating yesterday's meals, and on regenerate, today's current picks.
  const { data: recentPlans } = await supabase
    .from("meal_plans")
    .select("date, meals")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(2);

  const recentlyUsedIds = (recentPlans ?? []).flatMap((p) =>
    (p.meals as MealPlanEntry[]).map((m) => m.meal_id),
  );

  const plan = await generatePlan(onboarding, meals, new Date(), recentlyUsedIds);

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
export async function PATCH(request: Request) {
  const ctx = await loadContext();
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
