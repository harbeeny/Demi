import type { ActivityLevel } from "@/lib/supabase/types";
import type { Reasoned } from "./types";

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "mostly sitting",
  light: "lightly active (1-3 workouts/week)",
  moderate: "moderately active (3-5 workouts/week)",
  active: "active (6-7 workouts/week)",
  very_active: "very active (physical job or 2x daily training)",
};

/** Total daily energy expenditure = BMR x activity multiplier. */
export function tdee(bmrKcal: number, activityLevel: ActivityLevel): Reasoned<number> {
  if (bmrKcal <= 0) throw new Error("tdee: bmr must be positive");

  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel];
  const value = Math.round(bmrKcal * multiplier);

  return {
    value,
    reasoning: {
      rule: "activity_multiplier",
      inputs: { bmrKcal, activityLevel, multiplier },
      explanation: `Being ${ACTIVITY_LABELS[activityLevel]} multiplies your resting burn by ${multiplier}, so you use about ${value} kcal on a typical day.`,
    },
  };
}
