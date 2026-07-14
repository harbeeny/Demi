import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { loadContext, todayISO } from "@/lib/plan/context";
import { preflight, withCors } from "@/lib/plan/cors";
import { profileFromRow, type OnboardingRow } from "@/lib/plan/rows";
import {
  targets,
  detectAdjustment,
  MIN_WEIGH_INS,
  MIN_WEIGHT_SPAN_DAYS,
  MIN_LOGGED_DAYS,
  type AdaptResult,
  type WeighIn,
  type LoggedDay,
} from "@/lib/nutrition";
import type { Database } from "@/lib/supabase/types";

const COOLDOWN_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

type Client = SupabaseClient<Database>;

/**
 * The detection window: the last 14 days, but never reaching past the latest
 * onboarding row (profile edits and accepted adjustments both insert a new
 * row, so either automatically resets the window). Ends yesterday; today is
 * a partial day.
 */
async function loadWindow(supabase: Client, user: User, onboarding: OnboardingRow) {
  const today = todayISO();
  const fourteenAgo = new Date(Date.parse(today) - 13 * DAY_MS).toISOString().slice(0, 10);
  const profileDate = onboarding.created_at.slice(0, 10);
  const windowStart = profileDate > fourteenAgo ? profileDate : fourteenAgo;
  const yesterday = new Date(Date.parse(today) - DAY_MS).toISOString().slice(0, 10);

  const [{ data: weightRows }, { data: logRows }] = await Promise.all([
    supabase
      .from("weight_logs")
      .select("date, weight_kg")
      .eq("user_id", user.id)
      .gte("date", windowStart)
      .lte("date", yesterday)
      .order("date", { ascending: true }),
    supabase
      .from("daily_logs")
      .select("date, total_kcal")
      .eq("user_id", user.id)
      .gte("date", windowStart)
      .lte("date", yesterday),
  ]);

  const weighIns: WeighIn[] = (weightRows ?? []).map((w) => ({
    date: w.date,
    weightKg: Number(w.weight_kg),
  }));
  const loggedDays: LoggedDay[] = (logRows ?? []).map((l) => ({
    date: l.date,
    totalKcal: Number(l.total_kcal),
  }));
  return { weighIns, loggedDays };
}

function runDetection(onboarding: OnboardingRow, weighIns: WeighIn[], loggedDays: LoggedDay[]): AdaptResult {
  const profile = profileFromRow(onboarding);
  return detectAdjustment({ weighIns, loggedDays, profile, current: targets(profile) });
}

function spanDays(weighIns: WeighIn[]): number {
  if (weighIns.length < 2) return 0;
  const times = weighIns.map((w) => Date.parse(w.date));
  return Math.round((Math.max(...times) - Math.min(...times)) / DAY_MS);
}

function progressCounts(weighIns: WeighIn[], loggedDays: LoggedDay[]) {
  return {
    weighInCount: weighIns.length,
    weighInsNeeded: MIN_WEIGH_INS,
    spanDays: spanDays(weighIns),
    spanDaysNeeded: MIN_WEIGHT_SPAN_DAYS,
    loggedDayCount: loggedDays.length,
    loggedDaysNeeded: MIN_LOGGED_DAYS,
  };
}

function previewKcal(onboarding: OnboardingRow, newCorrection: number): number {
  return targets({ ...profileFromRow(onboarding), tdeeCorrection: newCorrection }).kcal.value;
}

type AdjustmentRow = Database["public"]["Tables"]["target_adjustments"]["Row"];

function proposalPayload(row: AdjustmentRow, onboarding: OnboardingRow) {
  return {
    id: row.id,
    createdAt: row.created_at,
    correctionDelta: row.correction_delta,
    newCorrection: row.new_correction,
    previewKcal: previewKcal(onboarding, row.new_correction),
    rationale: row.rationale,
    windowStats: row.window_stats,
  };
}

/** Current adaptive-target state; runs detection when nothing is pending. */
async function get(request: Request): Promise<Response> {
  const ctx = await loadContext(request);
  if ("error" in ctx) return ctx.error;
  const { supabase, user, onboarding } = ctx;

  const { weighIns, loggedDays } = await loadWindow(supabase, user, onboarding);
  const progress = progressCounts(weighIns, loggedDays);

  const { data: open } = await supabase
    .from("target_adjustments")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "proposed")
    .maybeSingle();

  if (open) {
    return NextResponse.json({
      proposal: proposalPayload(open, onboarding),
      insufficientData: [],
      cooldownUntil: null,
      progress,
    });
  }

  const { data: lastDismissed } = await supabase
    .from("target_adjustments")
    .select("resolved_at")
    .eq("user_id", user.id)
    .eq("status", "dismissed")
    .order("resolved_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastDismissed?.resolved_at) {
    const cooldownUntil = new Date(
      Date.parse(lastDismissed.resolved_at) + COOLDOWN_DAYS * DAY_MS,
    );
    if (cooldownUntil.getTime() > Date.now()) {
      return NextResponse.json({
        proposal: null,
        insufficientData: [],
        cooldownUntil: cooldownUntil.toISOString(),
        progress,
      });
    }
  }

  const result = runDetection(onboarding, weighIns, loggedDays);
  if (!result.proposal) {
    return NextResponse.json({
      proposal: null,
      insufficientData: result.insufficientData,
      cooldownUntil: null,
      progress,
    });
  }

  const p = result.proposal;
  const { data: inserted, error: insertError } = await supabase
    .from("target_adjustments")
    .insert({
      user_id: user.id,
      correction_delta: p.correctionDelta,
      new_correction: p.newCorrection,
      window_stats: {
        avgLoggedKcal: p.avgLoggedKcal,
        observedRateKgPerWeek: p.observedRateKgPerWeek,
        expectedRateKgPerWeek: p.expectedRateKgPerWeek,
        loggedDayCount: p.loggedDayCount,
        weighInCount: p.weighInCount,
        spanDays: p.spanDays,
        confidence: p.confidence,
      },
      rationale: p.rationale.explanation,
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: "Couldn't save the suggestion." }, { status: 500 });
  }

  return NextResponse.json({
    proposal: proposalPayload(inserted, onboarding),
    insufficientData: [],
    cooldownUntil: null,
    progress,
  });
}

/** Resolve a proposal: accept re-derives everything server-side. */
async function post(request: Request): Promise<Response> {
  const ctx = await loadContext(request);
  if ("error" in ctx) return ctx.error;
  const { supabase, user, onboarding } = ctx;

  const body = (await request.json().catch(() => ({}))) as {
    action?: "accept" | "dismiss";
    id?: string;
  };
  if (!body.id || (body.action !== "accept" && body.action !== "dismiss")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { data: row } = await supabase
    .from("target_adjustments")
    .select("*")
    .eq("id", body.id)
    .eq("user_id", user.id)
    .eq("status", "proposed")
    .maybeSingle();
  if (!row) {
    return NextResponse.json({ error: "No open suggestion found." }, { status: 404 });
  }

  if (body.action === "dismiss") {
    await supabase
      .from("target_adjustments")
      .update({ status: "dismissed", resolved_at: new Date().toISOString() })
      .eq("id", row.id);
    return NextResponse.json({ ok: true });
  }

  // Accept: never trust stored or client numbers. Recompute from raw data,
  // with the profile's weight refreshed to the latest check-in (that weight
  // is about to be written to the new onboarding row).
  const { data: latestWeigh } = await supabase
    .from("weight_logs")
    .select("weight_kg")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const weightKg = latestWeigh ? Number(latestWeigh.weight_kg) : Number(onboarding.weight_kg);

  const { weighIns, loggedDays } = await loadWindow(supabase, user, onboarding);
  const refreshedRow: OnboardingRow = { ...onboarding, weight_kg: weightKg };
  const recomputed = runDetection(refreshedRow, weighIns, loggedDays);

  if (!recomputed.proposal) {
    await supabase
      .from("target_adjustments")
      .update({ status: "dismissed", resolved_at: new Date().toISOString() })
      .eq("id", row.id);
    return NextResponse.json(
      { error: "This suggestion is out of date. We'll take a fresh look tomorrow." },
      { status: 409 },
    );
  }

  const p = recomputed.proposal;
  const { data: newRow, error: insertError } = await supabase
    .from("onboarding_answers")
    .insert({
      user_id: user.id,
      sex: onboarding.sex,
      age: onboarding.age,
      height_cm: Number(onboarding.height_cm),
      weight_kg: weightKg,
      goal: onboarding.goal,
      goal_rate: onboarding.goal_rate,
      activity_level: onboarding.activity_level,
      dietary_prefs: onboarding.dietary_prefs,
      allergies: onboarding.allergies,
      dislikes: onboarding.dislikes,
      budget: onboarding.budget,
      cooking_skill: onboarding.cooking_skill,
      meals_per_day: onboarding.meals_per_day,
      eating_window_start: onboarding.eating_window_start,
      eating_window_end: onboarding.eating_window_end,
      training_days: onboarding.training_days,
      training_time: onboarding.training_time,
      tdee_correction: p.newCorrection,
    })
    .select("*")
    .single();

  if (insertError || !newRow) {
    return NextResponse.json({ error: "Couldn't apply the adjustment." }, { status: 500 });
  }

  await supabase
    .from("target_adjustments")
    .update({
      status: "accepted",
      resolved_at: new Date().toISOString(),
      correction_delta: p.correctionDelta,
      new_correction: p.newCorrection,
      window_stats: {
        avgLoggedKcal: p.avgLoggedKcal,
        observedRateKgPerWeek: p.observedRateKgPerWeek,
        expectedRateKgPerWeek: p.expectedRateKgPerWeek,
        loggedDayCount: p.loggedDayCount,
        weighInCount: p.weighInCount,
        spanDays: p.spanDays,
        confidence: p.confidence,
      },
      rationale: p.rationale.explanation,
    })
    .eq("id", row.id);

  const fresh = targets(profileFromRow(newRow), { displayUnits: "us" });
  return NextResponse.json({
    ok: true,
    newKcal: fresh.kcal.value,
    tdeeCorrection: fresh.tdeeCorrection,
  });
}

export const GET = withCors(get);
export const POST = withCors(post);
export const OPTIONS = preflight("GET, POST, OPTIONS");
