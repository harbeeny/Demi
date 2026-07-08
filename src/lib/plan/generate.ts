import "server-only";

import type { Database, MealPlanEntry } from "@/lib/supabase/types";
import { distribute, targets, type ProfileInput } from "@/lib/nutrition";
import { selectMeals, type Meal, type SelectionPrefs } from "./select-meals";
import { personalize, type PersonalizedPlan } from "@/lib/ai/personalize";

type OnboardingRow = Database["public"]["Tables"]["onboarding_answers"]["Row"];

export interface GeneratedPlan {
  entries: MealPlanEntry[];
  rationale: PersonalizedPlan;
  slots: Array<{
    slot: string;
    timeHour: number;
    mealId: string;
    mealName: string;
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    why: string;
  }>;
  dayTargets: { kcal: number; proteinG: number; carbsG: number; fatG: number; fiberG: number };
}

export function profileFromRow(row: OnboardingRow): ProfileInput {
  return {
    sex: row.sex,
    age: row.age,
    heightCm: Number(row.height_cm),
    weightKg: Number(row.weight_kg),
    goal: row.goal,
    goalRate: row.goal_rate === null ? null : Number(row.goal_rate),
    activityLevel: row.activity_level,
    mealsPerDay: row.meals_per_day,
    eatingWindowStart: row.eating_window_start,
    eatingWindowEnd: row.eating_window_end,
    trainingDays: row.training_days,
    trainingTime: row.training_time ? row.training_time.slice(0, 5) : null,
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

/**
 * The full pipeline: targets -> distribute -> deterministic selection -> LLM
 * explanation. The LLM never chooses macros; it only explains what the
 * deterministic engine picked from the curated database.
 */
export async function generatePlan(
  row: OnboardingRow,
  allMeals: Meal[],
  today: Date,
  recentlyUsedIds: string[] = [],
): Promise<GeneratedPlan> {
  const profile = profileFromRow(row);
  const dayTargets = targets(profile, { displayUnits: "us" });
  const slotTargets = distribute(dayTargets, profile, today);
  const selected = selectMeals(allMeals, slotTargets, prefsFromRow(row), recentlyUsedIds);
  const rationale = await personalize(selected, dayTargets, profile);

  const whyById = new Map(rationale.meals.map((m) => [m.mealId, m.why]));

  return {
    entries: selected.map((s) => ({ meal_id: s.meal.id, slot: s.slot, servings: 1 })),
    rationale,
    slots: selected.map((s) => ({
      slot: s.slot,
      timeHour: s.timeHour,
      mealId: s.meal.id,
      mealName: s.meal.name,
      kcal: Number(s.meal.kcal),
      proteinG: Number(s.meal.protein_g),
      carbsG: Number(s.meal.carbs_g),
      fatG: Number(s.meal.fat_g),
      why: whyById.get(s.meal.id) ?? "",
    })),
    dayTargets: {
      kcal: dayTargets.kcal.value,
      proteinG: dayTargets.proteinG.value,
      carbsG: dayTargets.carbsG.value,
      fatG: dayTargets.fatG.value,
      fiberG: dayTargets.fiberG.value,
    },
  };
}
