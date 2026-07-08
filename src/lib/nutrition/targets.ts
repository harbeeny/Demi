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

const KCAL_PER_KG_TISSUE = 7700;
const FAT_FLOOR_G_PER_KG = 0.8;
const FAT_FLOOR_PCT_KCAL = 0.2;
const FIBER_G_PER_1000_KCAL = 14;

/**
 * Full daily targets from a profile. Applies, in order:
 * 1. BMR -> TDEE
 * 2. Goal rate -> kcal delta (deficit for lose_fat, surplus for build_muscle)
 * 3. SAFETY: minors get maintenance regardless of goal
 * 4. SAFETY: calorie floor per sex
 * 5. Protein anchored to bodyweight, fat floor, carbs fill, fiber scaled to kcal
 */
export function targets(profile: ProfileInput): MacroTargets {
  const basal = bmr(profile.sex, profile.age, profile.heightCm, profile.weightKg);
  const expenditure = tdee(basal.value, profile.activityLevel);

  const rate = profile.goalRate ?? DEFAULT_GOAL_RATES[profile.goal];
  const direction = profile.goal === "lose_fat" ? -1 : profile.goal === "build_muscle" ? 1 : 0;
  const dailyDelta = Math.round((rate * KCAL_PER_KG_TISSUE) / 7) * direction;

  const minorMaintenanceApplied = profile.age < 18;
  let kcal = minorMaintenanceApplied ? expenditure.value : expenditure.value + dailyDelta;

  const floor = CALORIE_FLOORS[profile.sex];
  const flooredBySafety = kcal < floor;
  if (flooredBySafety) kcal = floor;

  const kcalReasoning = minorMaintenanceApplied
    ? `Because you're under 18, your target stays at maintenance (${expenditure.value} kcal) — growing bodies shouldn't run deficits without clinical supervision.`
    : flooredBySafety
      ? `Your goal implied ${expenditure.value + dailyDelta} kcal, but we hold the line at ${floor} kcal — going lower isn't safe or sustainable.`
      : direction === 0
        ? `Your goal is ${profile.goal === "maintain" ? "maintenance" : "overall health"}, so you eat right at your daily burn of ${kcal} kcal.`
        : `A ${rate} kg/week ${direction < 0 ? "loss" : "gain"} works out to ${Math.abs(dailyDelta)} kcal ${direction < 0 ? "below" : "above"} your ${expenditure.value} kcal daily burn.`;

  const proteinPerKg = PROTEIN_G_PER_KG[profile.goal];
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
        rule: minorMaintenanceApplied ? "minor_maintenance" : flooredBySafety ? "safety_floor" : "goal_rate_delta",
        inputs: { bmr: basal.value, tdee: expenditure.value, rate, dailyDelta, floor, goal: profile.goal },
        explanation: kcalReasoning,
      },
    },
    proteinG: {
      value: proteinG,
      reasoning: {
        rule: "protein_per_kg_bodyweight",
        inputs: { weightKg: profile.weightKg, gPerKg: proteinPerKg, goal: profile.goal },
        explanation: `${proteinPerKg} g per kg of bodyweight (${proteinG} g) ${profile.goal === "lose_fat" ? "protects your muscle while you lose fat" : profile.goal === "build_muscle" ? "gives your muscles material to grow" : "keeps you strong and satisfied"}.`,
      },
    },
    fatG: {
      value: fatG,
      reasoning: {
        rule: "fat_floor_max_of_bodyweight_or_pct_kcal",
        inputs: { fatFromBodyweight: Math.round(fatFromBodyweight), fatFromKcal: Math.round(fatFromKcal) },
        explanation: `${fatG} g of fat keeps hormones and energy steady — we never cut fat below this floor.`,
      },
    },
    carbsG: {
      value: carbsG,
      reasoning: {
        rule: "carbs_fill_remainder",
        inputs: { kcal, proteinKcal: proteinG * 4, fatKcal: fatG * 9 },
        explanation: `After protein and fat, the remaining ${carbsG * 4} kcal go to carbs (${carbsG} g) — your main fuel for training and daily life.`,
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
    flooredBySafety,
    minorMaintenanceApplied,
  };
}
