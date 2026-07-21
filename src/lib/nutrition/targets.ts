import type { Goal, Sex } from "@/lib/supabase/types";
import type { MacroTargets, ProfileInput } from "./types";
import { bmr } from "./bmr";
import { tdee } from "./tdee";

/** SAFETY.md: never generate a target below these floors. */
export const CALORIE_FLOORS: Record<Sex, number> = {
  male: 1500,
  female: 1200,
  other: 1200,
};

/** Default kg/week rate per goal when the user doesn't set one. */
export const DEFAULT_GOAL_RATES: Record<Goal, number> = {
  lose_fat: 0.5,
  build_muscle: 0.25,
  maintain: 0,
  improve_health: 0,
};

/** Protein anchor in g/kg bodyweight per goal. */
export const PROTEIN_G_PER_KG: Record<Goal, number> = {
  lose_fat: 2.0, // higher protein preserves muscle in a deficit
  build_muscle: 1.8,
  maintain: 1.6,
  improve_health: 1.6,
};

/** Preference tiers shift the goal anchor in g/kg; moderate is the anchor itself. */
export type ProteinPref = "low" | "moderate" | "high" | "extra_high";
export const PROTEIN_PREF_DELTA: Record<ProteinPref, number> = {
  low: -0.25,
  moderate: 0,
  high: 0.25,
  extra_high: 0.5,
};
/** Evidence band the tiers may not leave, g/kg bodyweight. */
export const PROTEIN_G_PER_KG_MIN = 1.2;
export const PROTEIN_G_PER_KG_MAX = 2.4;

/** Energy density of body tissue change; shared with the adaptive engine. */
export const KCAL_PER_KG_TISSUE = 7700;
/** SAFETY: one accepted adaptive adjustment never moves TDEE more than this. */
export const MAX_CORRECTION_DELTA = 200;
/** SAFETY: lifetime cap on adaptive TDEE correction (~Mifflin's error band). */
export const MAX_CUMULATIVE_TDEE_CORRECTION = 500;

const FAT_FLOOR_G_PER_KG = 0.8;
const FAT_FLOOR_PCT_KCAL = 0.2;
const FIBER_G_PER_1000_KCAL = 14;

/** SAFETY.md: suggested loss never exceeds ~1% of bodyweight per week. */
export const MAX_LOSS_RATE_PCT_BW = 0.01;
/** SAFETY.md: targets never drop below this fraction of BMR. */
export const BMR_FLOOR_FRACTION = 0.8;
/** SAFETY.md: below this BMI, fat-loss goals become maintenance. */
export const UNDERWEIGHT_BMI = 18.5;

/**
 * Full daily targets from a profile. Applies, in order:
 * 1. BMR -> TDEE
 * 2. Goal rate -> kcal delta (deficit for lose_fat, surplus for build_muscle)
 * 3. SAFETY: loss rate capped at 1% bodyweight per week
 * 4. SAFETY: minors get maintenance regardless of goal
 * 5. SAFETY: BMI under 18.5 with a fat-loss goal gets maintenance
 * 6. SAFETY: calorie floor = max(sex floor, 0.8 x BMR)
 * 7. Protein anchored to bodyweight, fat floor, carbs fill, fiber scaled to kcal
 *
 * Math is always metric. `displayUnits: "us"` only changes explanation copy
 * (kg/week becomes lb/week).
 */
export interface TargetOptions {
  displayUnits?: "metric" | "us";
}

const LBS_PER_KG_DISPLAY = 2.20462;

/**
 * The hard daily minimum for a profile: max(sex floor, 80% of BMR). Exposed
 * so day-level adjustments (weekly balancing) can clamp against the same
 * line targets() itself enforces.
 */
export function calorieFloor(profile: ProfileInput): number {
  const basal = bmr(profile.sex, profile.age, profile.heightCm, profile.weightKg, profile.bodyFatPct);
  return Math.max(CALORIE_FLOORS[profile.sex], Math.round(basal.value * BMR_FLOOR_FRACTION));
}

export function targets(profile: ProfileInput, options: TargetOptions = {}): MacroTargets {
  const us = options.displayUnits === "us";
  const rateLabel = (kgPerWeek: number) =>
    us
      ? `${Number((kgPerWeek * LBS_PER_KG_DISPLAY).toFixed(1))} lb/week`
      : `${kgPerWeek} kg/week`;
  const basal = bmr(profile.sex, profile.age, profile.heightCm, profile.weightKg, profile.bodyFatPct);
  const expenditure = tdee(basal.value, profile.activityLevel);

  // Adaptive TDEE correction (accepted by the user from logged results).
  // Clamped here as the last line of defense; floors still apply after.
  const correction = Math.max(
    -MAX_CUMULATIVE_TDEE_CORRECTION,
    Math.min(MAX_CUMULATIVE_TDEE_CORRECTION, Math.round(profile.tdeeCorrection ?? 0)),
  );
  const adjustedTdee = expenditure.value + correction;

  // SAFETY: no more than ~1% of bodyweight per week of suggested loss.
  const requestedRate = profile.goalRate ?? DEFAULT_GOAL_RATES[profile.goal];
  const maxLossRate = MAX_LOSS_RATE_PCT_BW * profile.weightKg;
  const rateCappedBySafety = profile.goal === "lose_fat" && requestedRate > maxLossRate;
  const rate = rateCappedBySafety ? Number(maxLossRate.toFixed(2)) : requestedRate;

  const direction = profile.goal === "lose_fat" ? -1 : profile.goal === "build_muscle" ? 1 : 0;
  const dailyDelta = Math.round((rate * KCAL_PER_KG_TISSUE) / 7) * direction;

  const minorMaintenanceApplied = profile.age < 18;

  // SAFETY: an already-underweight body should not be steered into a deficit.
  const heightM = profile.heightCm / 100;
  const bmi = profile.weightKg / (heightM * heightM);
  const underweightMaintenanceApplied =
    !minorMaintenanceApplied && profile.goal === "lose_fat" && bmi < UNDERWEIGHT_BMI;

  const atMaintenance = minorMaintenanceApplied || underweightMaintenanceApplied;
  let kcal = atMaintenance ? adjustedTdee : adjustedTdee + dailyDelta;

  // SAFETY: never below the sex floor, and never below 80% of BMR.
  const floor = Math.max(CALORIE_FLOORS[profile.sex], Math.round(basal.value * BMR_FLOOR_FRACTION));
  const flooredBySafety = kcal < floor;
  if (flooredBySafety) kcal = floor;

  const kcalReasoning = minorMaintenanceApplied
    ? `Because you're under 18, your target stays at maintenance (${adjustedTdee} kcal). Growing bodies shouldn't run deficits without clinical supervision.`
    : underweightMaintenanceApplied
      ? `Your current weight is already at the low end of the healthy range, so we're holding you at maintenance (${adjustedTdee} kcal). Feeling stronger comes from fueling well, not eating less.`
      : flooredBySafety
        ? `Your goal implied ${adjustedTdee + dailyDelta} kcal, but we hold the line at ${floor} kcal. Going lower isn't safe or sustainable.`
        : direction === 0
          ? `Your goal is ${profile.goal === "maintain" ? "maintenance" : "overall health"}, so you eat right at your daily burn of ${kcal} kcal.`
          : rateCappedBySafety
            ? `We slowed your pace to ${rateLabel(rate)} (about 1% of your bodyweight). Faster than that tends to cost muscle and rebound, so this is ${Math.abs(dailyDelta)} kcal below your ${adjustedTdee} kcal daily burn.`
            : `A ${rateLabel(rate)} ${direction < 0 ? "loss" : "gain"} works out to ${Math.abs(dailyDelta)} kcal ${direction < 0 ? "below" : "above"} your ${adjustedTdee} kcal daily burn.`;

  const pref: ProteinPref = profile.proteinPref ?? "moderate";
  const proteinPerKg = Number(
    Math.min(
      PROTEIN_G_PER_KG_MAX,
      Math.max(PROTEIN_G_PER_KG_MIN, PROTEIN_G_PER_KG[profile.goal] + PROTEIN_PREF_DELTA[pref]),
    ).toFixed(2),
  );
  const proteinG = Math.round(proteinPerKg * profile.weightKg);

  const fatFromBodyweight = FAT_FLOOR_G_PER_KG * profile.weightKg;
  const fatFromKcal = (kcal * FAT_FLOOR_PCT_KCAL) / 9;
  const fatG = Math.round(Math.max(fatFromBodyweight, fatFromKcal));

  const carbsKcal = kcal - proteinG * 4 - fatG * 9;
  const carbsG = Math.max(0, Math.round(carbsKcal / 4));

  const fiberG = Math.round((kcal / 1000) * FIBER_G_PER_1000_KCAL);

  return {
    kcal: {
      value: kcal,
      reasoning: {
        rule: minorMaintenanceApplied
          ? "minor_maintenance"
          : underweightMaintenanceApplied
            ? "underweight_maintenance"
            : flooredBySafety
              ? "safety_floor"
              : rateCappedBySafety
                ? "rate_capped_goal_delta"
                : "goal_rate_delta",
        inputs: {
          bmr: basal.value,
          tdee: expenditure.value,
          tdeeCorrection: correction,
          adjustedTdee,
          requestedRate,
          rate,
          dailyDelta,
          floor,
          bmi: Number(bmi.toFixed(1)),
          goal: profile.goal,
        },
        explanation: kcalReasoning,
      },
    },
    proteinG: {
      value: proteinG,
      reasoning: {
        rule: "protein_per_kg_bodyweight",
        inputs: { weightKg: profile.weightKg, gPerKg: proteinPerKg, goal: profile.goal, proteinPref: pref },
        explanation: `${us ? `${Number((proteinPerKg / LBS_PER_KG_DISPLAY).toFixed(1))} g per lb` : `${proteinPerKg} g per kg`} of bodyweight (${proteinG} g) ${profile.goal === "lose_fat" ? "protects your muscle while you lose fat" : profile.goal === "build_muscle" ? "gives your muscles material to grow" : "keeps you strong and satisfied"}${pref === "moderate" ? "" : pref === "low" ? ", set to the lower end of the range you preferred" : pref === "high" ? ", set higher per your preference" : ", set to the top of the recommended range per your preference"}.`,
      },
    },
    fatG: {
      value: fatG,
      reasoning: {
        rule: "fat_floor_max_of_bodyweight_or_pct_kcal",
        inputs: { fatFromBodyweight: Math.round(fatFromBodyweight), fatFromKcal: Math.round(fatFromKcal) },
        explanation: `${fatG} g of fat keeps hormones and energy steady. We never cut fat below this floor.`,
      },
    },
    carbsG: {
      value: carbsG,
      reasoning: {
        rule: "carbs_fill_remainder",
        inputs: { kcal, proteinKcal: proteinG * 4, fatKcal: fatG * 9 },
        explanation: `After protein and fat, the remaining ${carbsG * 4} kcal go to carbs (${carbsG} g), your main fuel for training and daily life.`,
      },
    },
    fiberG: {
      value: fiberG,
      reasoning: {
        rule: "fiber_14g_per_1000_kcal",
        inputs: { kcal, gPer1000: FIBER_G_PER_1000_KCAL },
        explanation: `${fiberG} g of fiber (14 g per 1,000 kcal) keeps digestion and satiety on your side.`,
      },
    },
    tdeeCorrection:
      correction === 0
        ? null
        : {
            value: correction,
            reasoning: {
              rule: "adaptive_tdee_correction",
              inputs: { mifflinTdee: expenditure.value, correction, adjustedTdee },
              explanation:
                correction < 0
                  ? `Your logs and weight trend showed your daily burn runs about ${-correction} kcal below the standard estimate, so we use ${adjustedTdee} kcal instead of ${expenditure.value} kcal.`
                  : `Your logs and weight trend showed your daily burn runs about ${correction} kcal above the standard estimate, so we use ${adjustedTdee} kcal instead of ${expenditure.value} kcal.`,
            },
          },
    flooredBySafety,
    minorMaintenanceApplied,
    rateCappedBySafety,
    underweightMaintenanceApplied,
  };
}
