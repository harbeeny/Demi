// Row-to-domain mappers, client-safe: the Capacitor shell recomputes targets
// in the browser from the same onboarding row the server routes use.

import type { Database } from "@/lib/supabase/types";
import type { ProfileInput } from "@/lib/nutrition";
import type { SelectionPrefs } from "./select-meals";

export type OnboardingRow = Database["public"]["Tables"]["onboarding_answers"]["Row"];

export function profileFromRow(row: OnboardingRow): ProfileInput {
  return {
    sex: row.sex,
    age: row.age,
    heightCm: Number(row.height_cm),
    weightKg: Number(row.weight_kg),
    goal: row.goal,
    bodyFatPct: row.body_fat_pct,
    goalRate: row.goal_rate === null ? null : Number(row.goal_rate),
    activityLevel: row.activity_level,
    mealsPerDay: row.meals_per_day,
    eatingWindowStart: row.eating_window_start,
    eatingWindowEnd: row.eating_window_end,
    trainingDays: row.training_days,
    trainingTime: row.training_time ? row.training_time.slice(0, 5) : null,
    tdeeCorrection: row.tdee_correction,
  };
}

export function prefsFromRow(row: OnboardingRow): SelectionPrefs {
  return {
    dietaryPrefs: row.dietary_prefs,
    allergies: row.allergies,
    dislikes: row.dislikes,
    budget: row.budget,
    cookingSkill: row.cooking_skill,
  };
}
