import { NextResponse } from "next/server";

import { loadContext } from "@/lib/plan/context";
import { profileFromRow } from "@/lib/plan/generate";
import { targets } from "@/lib/nutrition";
import { reflect } from "@/lib/ai/reflect";
import { sumLogged } from "@/lib/log/remaining";
import { rollupTotals } from "@/lib/log/rollup";
import { containsDisorderedEatingSignal, SUPPORTIVE_RESPONSE } from "@/lib/ai/safety-filter";
import type { MealPlanEntry, MealSlot } from "@/lib/supabase/types";
import { preflight, withCors } from "@/lib/plan/cors";
import { consumeQuota, quotaExceeded } from "@/lib/plan/quota";

/** Close out the day: planned vs actual plus a short reflection. */
async function post(request: Request): Promise<Response> {
  const ctx = await loadContext(request);
  if ("error" in ctx) return ctx.error;
  const { supabase, user, onboarding, meals } = ctx;

  const body = (await request.json().catch(() => ({}))) as {
    energy?: number;
    dayNote?: string;
  };

  const energy =
    typeof body.energy === "number" && Number.isInteger(body.energy) && body.energy >= 1 && body.energy <= 5
      ? body.energy
      : null;

  const dayNote = typeof body.dayNote === "string" ? body.dayNote.trim().slice(0, 500) : "";
  if (dayNote && containsDisorderedEatingSignal(dayNote)) {
    return NextResponse.json({ supportive: SUPPORTIVE_RESPONSE });
  }

  const date = ctx.today;
  const { data: logs } = await supabase
    .from("meal_logs")
    .select("name, slot, kcal, protein_g, carbs_g, fat_g")
    .eq("user_id", user.id)
    .eq("date", date)
    .order("logged_at", { ascending: true });

  if (!logs || logs.length === 0) {
    return NextResponse.json({ error: "Log at least one meal first." }, { status: 400 });
  }

  const loggedMeals = logs.map((l) => ({
    name: l.name,
    slot: l.slot as MealSlot | null,
    kcal: Number(l.kcal),
    proteinG: Number(l.protein_g),
  }));
  const actual = sumLogged(
    logs.map((l) => ({
      kcal: Number(l.kcal),
      proteinG: Number(l.protein_g),
      carbsG: Number(l.carbs_g),
      fatG: Number(l.fat_g),
    })),
  );

  // Planned totals come from today's plan hydrated against the meal DB;
  // absent plan means a log-only day and the reflection payload omits it.
  const { data: planRow } = await supabase
    .from("meal_plans")
    .select("meals")
    .eq("user_id", user.id)
    .eq("date", date)
    .single();

  let planned = null;
  if (planRow) {
    const entries = planRow.meals as MealPlanEntry[];
    const byId = new Map(meals.map((m) => [m.id, m]));
    planned = sumLogged(
      entries.flatMap((e) => {
        const meal = byId.get(e.meal_id);
        if (!meal) return [];
        return [
          {
            kcal: Number(meal.kcal),
            proteinG: Number(meal.protein_g),
            carbsG: Number(meal.carbs_g),
            fatG: Number(meal.fat_g),
          },
        ];
      }),
    );
  }

  // The reflection is a billable LLM call; meter it per user so re-finishing
  // in a loop can't run up the bill.
  if (!(await consumeQuota(supabase, "llm"))) {
    return quotaExceeded("llm");
  }

  const dayTargets = targets(profileFromRow(onboarding));
  const reflection = await reflect({
    targets: {
      kcal: dayTargets.kcal.value,
      proteinG: dayTargets.proteinG.value,
      carbsG: dayTargets.carbsG.value,
      fatG: dayTargets.fatG.value,
    },
    planned,
    actual,
    loggedMeals,
    energy: energy ?? undefined,
    dayNote: dayNote || undefined,
  });

  const { error: saveError } = await supabase.from("daily_logs").upsert(
    {
      user_id: user.id,
      date,
      ...rollupTotals([actual]),
      energy,
      day_note: dayNote || null,
      reflection: reflection.reflection,
      tweak: reflection.tweak,
      finished_at: new Date().toISOString(),
    },
    { onConflict: "user_id,date" },
  );

  if (saveError) {
    return NextResponse.json({ error: "Couldn't save your summary." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    reflection: reflection.reflection,
    tweak: reflection.tweak,
    fallbackUsed: reflection.fallbackUsed,
  });
}

export const POST = withCors(post);
export const OPTIONS = preflight("POST, OPTIONS");
