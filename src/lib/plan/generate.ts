import "server-only";

import type { Database, MealPlanEntry } from "@/lib/supabase/types";
import { distribute, targets } from "@/lib/nutrition";
import { selectMeals, type Meal, type SelectionPrefs } from "./select-meals";
import { deterministicFallback, personalize, type PersonalizedPlan } from "@/lib/ai/personalize";

type OnboardingRow = Database["public"]["Tables"]["onboarding_answers"]["Row"];

// Mappers live in the client-safe rows module; re-exported so the API routes'
// existing imports keep working.
export { profileFromRow, prefsFromRow } from "./rows";
import { profileFromRow, prefsFromRow } from "./rows";

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

/**
 * The full pipeline: targets -> distribute -> deterministic selection -> LLM
 * explanation. The LLM never chooses macros; it only explains what the
 * deterministic engine picked from the curated database.
 */
export interface GenerateOptions {
  /** hard cap on prep_min + cook_min for eligible meals */
  maxPrepMin?: number;
  /** false = deterministic copy only (used for far-future week days) */
  personalizeWithLLM?: boolean;
}

export async function generatePlan(
  row: OnboardingRow,
  allMeals: Meal[],
  today: Date,
  recentlyUsedIds: string[] = [],
  opts: GenerateOptions = {},
): Promise<GeneratedPlan> {
  const profile = profileFromRow(row);
  const dayTargets = targets(profile, { displayUnits: "us" });
  const slotTargets = distribute(dayTargets, profile, today);
  const prefs = { ...prefsFromRow(row), maxPrepMin: opts.maxPrepMin };
  const selected = selectMeals(allMeals, slotTargets, prefs, recentlyUsedIds);
  const rationale =
    opts.personalizeWithLLM === false
      ? deterministicFallback(selected, dayTargets)
      : await personalize(selected, dayTargets, profile);

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
