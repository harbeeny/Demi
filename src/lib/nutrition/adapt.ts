// Adaptive target detection: compare what the logs and scale actually did
// against what the current target predicted, and propose a bounded TDEE
// correction when they disagree. Pure functions, no I/O; the /api/adjust
// route feeds it windowed rows and persists the result.
//
// SAFETY invariants (see SAFETY.md): never proposes for minors or underweight
// users, never proposes cuts on partial logging or implausible math, bounded
// at ±MAX_CORRECTION_DELTA per step and ±MAX_CUMULATIVE_TDEE_CORRECTION for
// life, and nothing here changes a target; only an explicit user accept does.

import type { MacroTargets, ProfileInput, Reasoning } from "./types";
import { bmr } from "./bmr";
import { tdee } from "./tdee";
import {
  KCAL_PER_KG_TISSUE,
  MAX_CORRECTION_DELTA,
  MAX_CUMULATIVE_TDEE_CORRECTION,
} from "./targets";

export interface WeighIn {
  /** ISO date, e.g. "2026-07-14" */
  date: string;
  weightKg: number;
}

export interface LoggedDay {
  date: string;
  totalKcal: number;
}

export const ADAPT_WINDOW_DAYS = 14;
export const MIN_WEIGH_INS = 4;
export const MIN_WEIGHT_SPAN_DAYS = 10;
export const MIN_LOGGED_DAYS = 10;
/** ~165 kcal/day of model error; below this is daily water noise. */
export const DIVERGENCE_THRESHOLD_KG_PER_WEEK = 0.15;
/** Don't propose noise-sized nudges. */
export const MIN_CORRECTION_DELTA = 50;
/** Cut proposals require logging at least this fraction of the target. */
export const MIN_ADHERENCE_FOR_CUT = 0.75;
/** An implied TDEE below this fraction of BMR means certain under-logging. */
export const IMPLAUSIBLE_TDEE_BMR_FRACTION = 0.9;
/** High confidence needs this much data. */
export const HIGH_CONFIDENCE_WEIGH_INS = 8;
export const HIGH_CONFIDENCE_LOGGED_DAYS = 12;

export type InsufficientReason =
  | "too_few_weigh_ins"
  | "weigh_in_span_too_short"
  | "too_few_logged_days"
  | "no_divergence"
  | "delta_too_small"
  | "safety_maintenance_active"
  | "target_at_floor"
  | "low_logging_adherence"
  | "implausible_low_tdee"
  | "cumulative_correction_reached";

export interface AdaptProposal {
  /** kcal/day change this adjustment applies; clamped, never 0 */
  correctionDelta: number;
  /** cumulative correction after accepting; clamped to the lifetime cap */
  newCorrection: number;
  observedRateKgPerWeek: number;
  expectedRateKgPerWeek: number;
  avgLoggedKcal: number;
  loggedDayCount: number;
  weighInCount: number;
  spanDays: number;
  confidence: "high" | "moderate";
  rationale: Reasoning;
}

export interface AdaptResult {
  proposal: AdaptProposal | null;
  insufficientData: InsufficientReason[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayOffset(date: string, epoch: string): number {
  return Math.round((Date.parse(date) - Date.parse(epoch)) / DAY_MS);
}

/** Least-squares slope over day offsets, in kg/week. Order-independent. */
export function weightTrendKgPerWeek(weighIns: WeighIn[]): number {
  if (weighIns.length < 2) return 0;
  const epoch = weighIns[0].date;
  const xs = weighIns.map((w) => dayOffset(w.date, epoch));
  const ys = weighIns.map((w) => w.weightKg);
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return 0;
  return (num / den) * 7;
}

function spanDays(weighIns: WeighIn[]): number {
  if (weighIns.length < 2) return 0;
  const times = weighIns.map((w) => Date.parse(w.date));
  return Math.round((Math.max(...times) - Math.min(...times)) / DAY_MS);
}

/**
 * Decide whether the last ~two weeks justify proposing a TDEE correction.
 * Caller supplies rows already filtered to the window (ending yesterday;
 * today is a partial day). Returns a proposal or the reasons there isn't one.
 */
export function detectAdjustment(args: {
  weighIns: WeighIn[];
  loggedDays: LoggedDay[];
  profile: ProfileInput;
  current: MacroTargets;
}): AdaptResult {
  const { weighIns, loggedDays, profile, current } = args;
  const reasons: InsufficientReason[] = [];

  // Gate 1: never propose where targets() forces maintenance for safety.
  if (current.minorMaintenanceApplied || current.underweightMaintenanceApplied) {
    return { proposal: null, insufficientData: ["safety_maintenance_active"] };
  }

  // Gate 2: data sufficiency.
  const span = spanDays(weighIns);
  if (weighIns.length < MIN_WEIGH_INS) reasons.push("too_few_weigh_ins");
  else if (span < MIN_WEIGHT_SPAN_DAYS) reasons.push("weigh_in_span_too_short");
  if (loggedDays.length < MIN_LOGGED_DAYS) reasons.push("too_few_logged_days");
  if (reasons.length > 0) return { proposal: null, insufficientData: reasons };

  const existingCorrection = Math.round(profile.tdeeCorrection ?? 0);
  const basal = bmr(profile.sex, profile.age, profile.heightCm, profile.weightKg).value;
  const mifflinTdee = tdee(basal, profile.activityLevel).value;
  const currentEstTdee = mifflinTdee + existingCorrection;

  const avgLoggedKcal = Math.round(
    loggedDays.reduce((a, d) => a + d.totalKcal, 0) / loggedDays.length,
  );
  const observedRate = weightTrendKgPerWeek(weighIns);
  const expectedRate = ((avgLoggedKcal - currentEstTdee) * 7) / KCAL_PER_KG_TISSUE;

  // Gate 3: divergence vs what the ACTUAL current target asked of the user
  // (floored or rate-capped users are judged against the applied target, so
  // someone tracking their target never gets "you're succeeding, here's a cut").
  const targetImpliedRate = ((current.kcal.value - currentEstTdee) * 7) / KCAL_PER_KG_TISSUE;
  if (Math.abs(observedRate - targetImpliedRate) < DIVERGENCE_THRESHOLD_KG_PER_WEEK) {
    return { proposal: null, insufficientData: ["no_divergence"] };
  }

  // The correction: what TDEE would make intake and weight trend consistent.
  const impliedTdee = Math.round(avgLoggedKcal - (observedRate * KCAL_PER_KG_TISSUE) / 7);
  const rawDelta = impliedTdee - currentEstTdee;

  // Gate 4: clamps and magnitude.
  const cumulativeClamped = Math.max(
    -MAX_CUMULATIVE_TDEE_CORRECTION,
    Math.min(MAX_CUMULATIVE_TDEE_CORRECTION, existingCorrection + rawDelta),
  );
  let correctionDelta = Math.max(
    -MAX_CORRECTION_DELTA,
    Math.min(MAX_CORRECTION_DELTA, cumulativeClamped - existingCorrection),
  );
  correctionDelta = Math.round(correctionDelta);
  if (correctionDelta === 0 && rawDelta !== 0) {
    return { proposal: null, insufficientData: ["cumulative_correction_reached"] };
  }
  if (Math.abs(correctionDelta) < MIN_CORRECTION_DELTA) {
    return { proposal: null, insufficientData: ["delta_too_small"] };
  }
  const newCorrection = existingCorrection + correctionDelta;

  if (correctionDelta < 0) {
    // Gate 5: cuts only from credible data. Under-logging drags the implied
    // TDEE down, so partial logs must never argue the target downward.
    if (avgLoggedKcal < MIN_ADHERENCE_FOR_CUT * current.kcal.value) {
      return { proposal: null, insufficientData: ["low_logging_adherence"] };
    }
    if (impliedTdee < IMPLAUSIBLE_TDEE_BMR_FRACTION * basal) {
      return { proposal: null, insufficientData: ["implausible_low_tdee"] };
    }
    // Gate 6: a cut cannot apply below the floor; proposing it is theater.
    if (current.flooredBySafety) {
      return { proposal: null, insufficientData: ["target_at_floor"] };
    }
  }

  const confidence =
    weighIns.length >= HIGH_CONFIDENCE_WEIGH_INS && loggedDays.length >= HIGH_CONFIDENCE_LOGGED_DAYS
      ? "high"
      : "moderate";

  const direction = correctionDelta < 0 ? "lower" : "higher";
  const rationale: Reasoning = {
    rule: "tdee_correction_from_intake_and_trend",
    inputs: {
      avgLoggedKcal,
      loggedDayCount: loggedDays.length,
      weighInCount: weighIns.length,
      spanDays: span,
      observedRateKgPerWeek: Number(observedRate.toFixed(2)),
      expectedRateKgPerWeek: Number(expectedRate.toFixed(2)),
      impliedTdee,
      currentEstTdee,
      mifflinTdee,
      correctionDelta,
      newCorrection,
    },
    explanation: `Over the last ${ADAPT_WINDOW_DAYS} days you logged an average of ${avgLoggedKcal} kcal and your weight changed by about ${Number(observedRate.toFixed(2))} kg per week. Together those suggest your daily burn is about ${Math.abs(correctionDelta)} kcal ${direction} than the current estimate. Adjusting your daily target by ${correctionDelta} kcal would line your plan up with how your body actually responds.`,
  };

  return {
    proposal: {
      correctionDelta,
      newCorrection,
      observedRateKgPerWeek: Number(observedRate.toFixed(2)),
      expectedRateKgPerWeek: Number(expectedRate.toFixed(2)),
      avgLoggedKcal,
      loggedDayCount: loggedDays.length,
      weighInCount: weighIns.length,
      spanDays: span,
      confidence,
      rationale,
    },
    insufficientData: [],
  };
}
