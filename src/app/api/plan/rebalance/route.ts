import { NextResponse } from "next/server";

import { loadContext } from "@/lib/plan/context";
import { localHour } from "@/lib/dates";
import { profileFromRow, prefsFromRow } from "@/lib/plan/generate";
import { shiftDeltaFor } from "@/lib/plan/shift";
import { scoreMeal, isEligible } from "@/lib/plan/select-meals";
import { calorieFloor, distribute, targets } from "@/lib/nutrition";
import { remainingBudget, sumLogged } from "@/lib/log/remaining";
import { applyKcalDelta } from "@/lib/log/balance";
import { fetchDayDelta } from "@/lib/log/adjustments";
import { rebalanceSlotTargets } from "@/lib/log/rebalance";
import type { MealPlanEntry } from "@/lib/supabase/types";
import { preflight, withCors } from "@/lib/plan/cors";

/** Re-pick the unlogged, still-upcoming slots to fit the remaining budget. */
async function post(request: Request): Promise<Response> {
  const ctx = await loadContext(request);
  if ("error" in ctx) return ctx.error;
  const { supabase, user, onboarding, meals, today, timezone, prefers24h } = ctx;

  const date = today;
  const { data: planRow } = await supabase
    .from("meal_plans")
    .select("id, meals")
    .eq("user_id", user.id)
    .eq("date", date)
    .single();
  if (!planRow) {
    return NextResponse.json({ error: "No plan for today yet." }, { status: 404 });
  }

  const { data: logs } = await supabase
    .from("meal_logs")
    .select("kcal, protein_g, carbs_g, fat_g, plan_slot_index, source")
    .eq("user_id", user.id)
    .eq("date", date);

  const eaten = sumLogged(
    (logs ?? []).map((l) => ({
      kcal: Number(l.kcal),
      proteinG: Number(l.protein_g),
      carbsG: Number(l.carbs_g),
      fatG: Number(l.fat_g),
    })),
  );

  const profile = profileFromRow(onboarding);
  const dayTargets = targets(profile);
  // Weekly balancing shrinks the budget the remaining meals must fit.
  const kcalDelta =
    (await fetchDayDelta(supabase, user.id, date)) +
    shiftDeltaFor(profile, date, dayTargets.kcal.value, calorieFloor(profile));
  const remaining = remainingBudget(
    applyKcalDelta(
      {
        kcal: dayTargets.kcal.value,
        proteinG: dayTargets.proteinG.value,
        carbsG: dayTargets.carbsG.value,
        fatG: dayTargets.fatG.value,
      },
      kcalDelta,
      calorieFloor(profile),
    ),
    eaten,
  );

  // Upcoming and unlogged: no planned log for the slot index, and the slot's
  // time has not passed, in the user's own timezone.
  const entries = planRow.meals as MealPlanEntry[];
  const loggedIndexes = new Set(
    (logs ?? []).filter((l) => l.source === "planned").map((l) => l.plan_slot_index),
  );
  const nowHour = localHour(timezone ?? "UTC");
  const slotTargets = distribute(dayTargets, profile, new Date(), prefers24h);

  const upcoming = entries
    .map((entry, index) => ({ entry, index, target: slotTargets[index] }))
    .filter(
      ({ entry, index, target }) =>
        target !== undefined &&
        !loggedIndexes.has(index) &&
        (entry.time_hour ?? target.timeHour) >= nowHour,
    );

  if (remaining.kcal <= 0 || upcoming.length === 0) {
    return NextResponse.json({ error: "Nothing left to rebalance today." }, { status: 409 });
  }

  const newTargets = rebalanceSlotTargets(
    remaining,
    upcoming.map(({ target }) => target),
  );

  const prefs = prefsFromRow(onboarding);
  const usedIds = new Set(entries.map((e) => e.meal_id));
  const changedSlots: number[] = [];

  upcoming.forEach(({ entry, index }, i) => {
    const slotTarget = newTargets[i];
    const candidates = meals
      .filter((m) => isEligible(m, prefs) && !usedIds.has(m.id))
      .filter((m) => m.tags.includes(entry.slot))
      .sort((a, b) => scoreMeal(a, slotTarget) - scoreMeal(b, slotTarget));

    const replacement = candidates[0];
    if (!replacement || replacement.id === entry.meal_id) return;

    usedIds.add(replacement.id);
    entries[index] = {
      ...entry,
      meal_id: replacement.id,
      why: "Re-picked to fit what's left of your day.",
    };
    changedSlots.push(index);
  });

  if (changedSlots.length === 0) {
    return NextResponse.json({ error: "Your remaining meals already fit best." }, { status: 409 });
  }

  const { error: updateError } = await supabase
    .from("meal_plans")
    .update({ meals: entries })
    .eq("id", planRow.id);

  if (updateError) {
    return NextResponse.json({ error: "Couldn't save the rebalance." }, { status: 500 });
  }

  await supabase.from("plan_events").insert({
    user_id: user.id,
    plan_id: planRow.id,
    event: "rebalanced",
  });

  return NextResponse.json({ ok: true, changedSlots });
}

export const POST = withCors(post);
export const OPTIONS = preflight("POST, OPTIONS");
