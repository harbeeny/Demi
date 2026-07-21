import { NextResponse } from "next/server";

import { loadContext } from "@/lib/plan/context";
import { profileFromRow } from "@/lib/plan/generate";
import { shiftDeltaFor } from "@/lib/plan/shift";
import { calorieFloor, targets } from "@/lib/nutrition";
import { addDaysISO, applyKcalDelta, planSpread, remainingWeekDates } from "@/lib/log/balance";
import { fetchDayDelta } from "@/lib/log/adjustments";
import { preflight, withCors } from "@/lib/plan/cors";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Spread a day's calorie overage across the rest of its week. The server
 * recomputes everything (overage, caps, floors) from its own data; the
 * client's preview is cosmetic. Re-balancing the same day replaces that
 * day's earlier spread instead of stacking on itself.
 *
 * The source day is today or, for the big-night-logged-the-morning-after
 * flow, yesterday (an intent flag, never a client date). Balancing
 * yesterday spreads from today onward, so today gives up at most the same
 * capped slice as any other day instead of absorbing the night whole.
 */
async function post(request: Request): Promise<Response> {
  const ctx = await loadContext(request);
  if ("error" in ctx) return ctx.error;
  const { supabase, user, onboarding } = ctx;

  const body = (await request.json().catch(() => ({}))) as { source?: string };
  const sourceDate = body.source === "yesterday" ? addDaysISO(ctx.today, -1) : ctx.today;

  const profile = profileFromRow(onboarding);
  const dayTargets = targets(profile);
  const floorKcal = calorieFloor(profile);

  const { data: logs } = await supabase
    .from("meal_logs")
    .select("kcal")
    .eq("user_id", user.id)
    .eq("date", sourceDate);
  const eatenKcal = (logs ?? []).reduce((sum, l) => sum + Number(l.kcal), 0);

  // Over is measured against what the user actually sees for the source
  // day: the base target minus any reduction earlier balances put on it.
  const sourceDelta = await fetchDayDelta(supabase, user.id, sourceDate);
  const sourceShift = shiftDeltaFor(profile, sourceDate, dayTargets.kcal.value, floorKcal);
  const sourceKcal = applyKcalDelta(
    {
      kcal: dayTargets.kcal.value,
      proteinG: dayTargets.proteinG.value,
      carbsG: dayTargets.carbsG.value,
      fatG: dayTargets.fatG.value,
    },
    sourceDelta + sourceShift,
    floorKcal,
  ).kcal;

  const overage = Math.round(eatenKcal - sourceKcal);
  if (overage <= 0) {
    return NextResponse.json(
      {
        error:
          sourceDate === ctx.today
            ? "You're not over target today."
            : "Last night stayed within its target.",
      },
      { status: 400 },
    );
  }

  // Capacity already used on the remaining days by OTHER balances this
  // week; the source day's own earlier spread is being replaced, so it's
  // excluded. For a yesterday source the remaining days include today.
  const dates = remainingWeekDates(sourceDate);
  const existingReductionByDate: Record<string, number> = {};
  if (dates.length > 0) {
    const { data: existing } = await supabase
      .from("day_adjustments")
      .select("date, kcal_delta, source_date")
      .eq("user_id", user.id)
      .in("date", dates);
    for (const row of existing ?? []) {
      if (row.source_date === sourceDate) continue;
      existingReductionByDate[row.date] =
        (existingReductionByDate[row.date] ?? 0) + Math.max(0, -Number(row.kcal_delta));
    }
  }

  const shiftByDate = Object.fromEntries(
    remainingWeekDates(sourceDate).map((d) => [
      d,
      shiftDeltaFor(profile, d, dayTargets.kcal.value, floorKcal),
    ]),
  );
  const plan = planSpread({
    overageKcal: overage,
    sourceDate,
    targetKcal: dayTargets.kcal.value,
    floorKcal,
    existingReductionByDate,
    shiftByDate,
    strategy: profile.calorieDistribution === "shift" ? "front" : "even",
  });

  const { error: clearError } = await supabase
    .from("day_adjustments")
    .delete()
    .eq("user_id", user.id)
    .eq("source_date", sourceDate);
  if (clearError) {
    return NextResponse.json({ error: "Couldn't update your balance." }, { status: 500 });
  }

  if (plan.days.length > 0) {
    const { error: insertError } = await supabase.from("day_adjustments").insert(
      plan.days.map((d) => ({
        user_id: user.id,
        date: d.date,
        kcal_delta: d.deltaKcal,
        source_date: sourceDate,
      })),
    );
    if (insertError) {
      return NextResponse.json({ error: "Couldn't save your balance." }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    overage,
    absorbed: plan.absorbed,
    forgiven: plan.forgiven,
    days: plan.days,
  });
}

/** Remove a balance (all adjustments created from one source day). */
async function del(request: Request): Promise<Response> {
  const ctx = await loadContext(request);
  if ("error" in ctx) return ctx.error;
  const { supabase, user } = ctx;

  const body = (await request.json().catch(() => ({}))) as { sourceDate?: string };
  const sourceDate =
    typeof body.sourceDate === "string" && DATE_RE.test(body.sourceDate)
      ? body.sourceDate
      : ctx.today;

  const { error } = await supabase
    .from("day_adjustments")
    .delete()
    .eq("user_id", user.id)
    .eq("source_date", sourceDate);
  if (error) {
    return NextResponse.json({ error: "Couldn't remove the balance." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export const POST = withCors(post);
export const DELETE = withCors(del);
export const OPTIONS = preflight("POST, DELETE, OPTIONS");
