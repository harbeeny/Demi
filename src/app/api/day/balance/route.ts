import { NextResponse } from "next/server";

import { loadContext } from "@/lib/plan/context";
import { profileFromRow } from "@/lib/plan/generate";
import { calorieFloor, targets } from "@/lib/nutrition";
import { applyKcalDelta, planSpread, remainingWeekDates } from "@/lib/log/balance";
import { fetchDayDelta } from "@/lib/log/adjustments";
import { preflight, withCors } from "@/lib/plan/cors";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Spread today's calorie overage across the rest of the week. The server
 * recomputes everything (overage, caps, floors) from its own data; the
 * client's preview is cosmetic. Re-balancing the same day replaces that
 * day's earlier spread instead of stacking on itself.
 */
async function post(request: Request): Promise<Response> {
  const ctx = await loadContext(request);
  if ("error" in ctx) return ctx.error;
  const { supabase, user, onboarding } = ctx;

  const profile = profileFromRow(onboarding);
  const dayTargets = targets(profile);
  const floorKcal = calorieFloor(profile);

  const { data: logs } = await supabase
    .from("meal_logs")
    .select("kcal")
    .eq("user_id", user.id)
    .eq("date", ctx.today);
  const eatenKcal = (logs ?? []).reduce((sum, l) => sum + Number(l.kcal), 0);

  // Over is measured against what the user actually sees today: the base
  // target minus any reduction earlier balances already put on this day.
  const todayDelta = await fetchDayDelta(supabase, user.id, ctx.today);
  const todayKcal = applyKcalDelta(
    {
      kcal: dayTargets.kcal.value,
      proteinG: dayTargets.proteinG.value,
      carbsG: dayTargets.carbsG.value,
      fatG: dayTargets.fatG.value,
    },
    todayDelta,
    floorKcal,
  ).kcal;

  const overage = Math.round(eatenKcal - todayKcal);
  if (overage <= 0) {
    return NextResponse.json({ error: "You're not over target today." }, { status: 400 });
  }

  // Capacity already used on the remaining days by OTHER balances this
  // week; today's own earlier spread is being replaced, so it's excluded.
  const dates = remainingWeekDates(ctx.today);
  const existingReductionByDate: Record<string, number> = {};
  if (dates.length > 0) {
    const { data: existing } = await supabase
      .from("day_adjustments")
      .select("date, kcal_delta, source_date")
      .eq("user_id", user.id)
      .in("date", dates);
    for (const row of existing ?? []) {
      if (row.source_date === ctx.today) continue;
      existingReductionByDate[row.date] =
        (existingReductionByDate[row.date] ?? 0) + Math.max(0, -Number(row.kcal_delta));
    }
  }

  const plan = planSpread({
    overageKcal: overage,
    sourceDate: ctx.today,
    targetKcal: dayTargets.kcal.value,
    floorKcal,
    existingReductionByDate,
  });

  const { error: clearError } = await supabase
    .from("day_adjustments")
    .delete()
    .eq("user_id", user.id)
    .eq("source_date", ctx.today);
  if (clearError) {
    return NextResponse.json({ error: "Couldn't update your balance." }, { status: 500 });
  }

  if (plan.days.length > 0) {
    const { error: insertError } = await supabase.from("day_adjustments").insert(
      plan.days.map((d) => ({
        user_id: user.id,
        date: d.date,
        kcal_delta: d.deltaKcal,
        source_date: ctx.today,
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
