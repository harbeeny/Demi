import { NextResponse, after } from "next/server";

import { loadContext } from "@/lib/plan/context";
import { scoreMeal, isEligible } from "@/lib/plan/select-meals";
import { calorieFloor, distribute, targets } from "@/lib/nutrition";
import { profileFromRow, prefsFromRow } from "@/lib/plan/generate";
import { applyKcalDeltaToTargets } from "@/lib/log/balance";
import { fetchDayDelta } from "@/lib/log/adjustments";
import type { MealPlanEntry, MealSlot } from "@/lib/supabase/types";
import { preflight, withCors } from "@/lib/plan/cors";
import { enqueueJob } from "@/lib/plan/jobs";
import { processJob } from "@/lib/plan/worker";

/**
 * Enqueue today's plan build and return immediately; the worker runs after
 * the response and the client polls GET /api/plan/job. Requests no longer
 * block on the model, and a mid-flight instance death is recovered by the
 * poll re-claiming the stale job.
 */
async function post(request: Request): Promise<Response> {
  const ctx = await loadContext(request);
  if ("error" in ctx) return ctx.error;
  const { supabase, user, onboarding, meals, today, prefers24h } = ctx;

  const body = (await request.json().catch(() => ({}))) as {
    regenerate?: boolean;
    maxPrepMin?: number;
  };
  const maxPrepMin =
    Number.isFinite(body.maxPrepMin) && Number(body.maxPrepMin) > 0
      ? Number(body.maxPrepMin)
      : undefined;

  // Idempotency stays request-side: an existing plan without regenerate is
  // a free 200, no job churn.
  if (!body.regenerate) {
    const { data: existing } = await supabase
      .from("meal_plans")
      .select("id")
      .eq("user_id", user.id)
      .eq("date", today)
      .maybeSingle();
    if (existing) return NextResponse.json({ ok: true, unchanged: true });
  }

  const job = await enqueueJob(supabase, user.id, "plan", {
    regenerate: body.regenerate === true,
    ...(maxPrepMin !== undefined ? { maxPrepMin } : {}),
  });
  if (!job) {
    return NextResponse.json({ error: "Couldn't queue the plan build." }, { status: 500 });
  }

  // The worker runs in this same invocation, after the response is sent.
  after(() =>
    processJob({ supabase, userId: user.id, onboarding, meals, today, prefers24h }, job.id),
  );

  return NextResponse.json({ ok: true, queued: true, jobId: job.id }, { status: 202 });
}

/** Swap one meal slot for the next-best alternative. */
async function patch(request: Request): Promise<Response> {
  const ctx = await loadContext(request);
  if ("error" in ctx) return ctx.error;
  const { supabase, user, onboarding, meals, today, prefers24h } = ctx;

  const body = (await request.json().catch(() => ({}))) as { slotIndex?: number };
  if (typeof body.slotIndex !== "number") {
    return NextResponse.json({ error: "slotIndex is required." }, { status: 400 });
  }

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

  const entries = planRow.meals as MealPlanEntry[];
  const entry = entries[body.slotIndex];
  if (!entry) {
    return NextResponse.json({ error: "Invalid slot index." }, { status: 400 });
  }

  // Rebuild this slot's macro target so the replacement still fits the day,
  // including any weekly-balance reduction on today's budget.
  const profile = profileFromRow(onboarding);
  const swapDelta = await fetchDayDelta(supabase, user.id, date);
  const adjustedTargets = applyKcalDeltaToTargets(
    targets(profile),
    swapDelta,
    calorieFloor(profile),
  );
  const slotTargets = distribute(adjustedTargets, profile, new Date(), prefers24h);
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
