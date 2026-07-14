import type { Database, MealSlot } from "@/lib/supabase/types";
import type { SlotTarget } from "@/lib/nutrition";

export type Meal = Database["public"]["Tables"]["meals"]["Row"];

export interface SelectionPrefs {
  dietaryPrefs: string[]; // e.g. ["vegetarian"]; every pref must be satisfied (see DIET_SATISFIES)
  allergies: string[]; // substring-matched against name + tags, meal excluded on hit
  dislikes: string[]; // substring-matched against name, meal excluded on hit
  budget: "low" | "medium" | "high";
  cookingSkill: "minimal" | "basic" | "confident";
}

export interface SelectedMeal {
  meal: Meal;
  slot: MealSlot;
  timeHour: number;
  /** why this meal was picked, machine-readable */
  fit: {
    kcalDiff: number;
    proteinDiff: number;
    score: number;
  };
  /** set when the meal repeats within the same day because options ran out */
  reused?: boolean;
}

const BUDGET_RANK = { low: 0, medium: 1, high: 2 } as const;
const SKILL_RANK = { minimal: 0, basic: 1, confident: 2 } as const;

/**
 * Diet hierarchy: a pref is satisfied by any tag at least as restrictive.
 * Pescatarians can eat vegetarian/vegan meals; vegetarians can eat vegan
 * meals. Prefs not listed here (vegan, gluten_free, ...) require the exact tag.
 */
const DIET_SATISFIES: Record<string, string[]> = {
  pescatarian: ["pescatarian", "vegetarian", "vegan"],
  vegetarian: ["vegetarian", "vegan"],
};

/** A meal is eligible for a user if it passes every hard filter. */
export function isEligible(meal: Meal, prefs: SelectionPrefs): boolean {
  const tags = meal.tags.map((t) => t.toLowerCase());
  const name = meal.name.toLowerCase();

  // Diet pattern: every user pref must be satisfied by some tag.
  for (const pref of prefs.dietaryPrefs) {
    const accepted = DIET_SATISFIES[pref.toLowerCase()] ?? [pref.toLowerCase()];
    if (!accepted.some((tag) => tags.includes(tag))) return false;
  }

  // Allergies and dislikes: exclude on any match against name or tags.
  for (const allergen of prefs.allergies) {
    const a = allergen.toLowerCase();
    if (name.includes(a) || tags.some((t) => t.includes(a))) return false;
  }
  for (const dislike of prefs.dislikes) {
    if (name.includes(dislike.toLowerCase())) return false;
  }

  // Budget: meal's budget tag must not exceed the user's.
  const mealBudget = (["low", "medium", "high"] as const).find((b) => tags.includes(b));
  if (mealBudget && BUDGET_RANK[mealBudget] > BUDGET_RANK[prefs.budget]) return false;

  // Skill: meal's skill tag must not exceed the user's.
  const mealSkill = (["minimal", "basic", "confident"] as const).find((s) => tags.includes(s));
  if (mealSkill && SKILL_RANK[mealSkill] > SKILL_RANK[prefs.cookingSkill]) return false;

  return true;
}

/**
 * Macro-fit score: weighted distance from the slot target, lower is better.
 * Protein misses hurt more than carb/fat misses (protein is the anchor).
 */
export function scoreMeal(meal: Meal, target: SlotTarget): number {
  const kcalDiff = Math.abs(Number(meal.kcal) - target.kcal) / Math.max(target.kcal, 1);
  const proteinDiff = Math.abs(Number(meal.protein_g) - target.proteinG) / Math.max(target.proteinG, 1);
  const carbsDiff = Math.abs(Number(meal.carbs_g) - target.carbsG) / Math.max(target.carbsG, 1);
  const fatDiff = Math.abs(Number(meal.fat_g) - target.fatG) / Math.max(target.fatG, 1);
  return kcalDiff * 1.0 + proteinDiff * 1.5 + carbsDiff * 0.5 + fatDiff * 0.5;
}

/** Penalty added to meals used recently, to force variety. */
const RECENT_USE_PENALTY = 0.75;

/** Heavier penalty for repeating a meal within the same day. */
const SAME_DAY_REUSE_PENALTY = 1.5;

/**
 * Pick one meal per slot target. Deterministic:
 * 1. Hard-filter by prefs/allergies/dislikes/budget/skill.
 * 2. Within a slot, prefer meals tagged for that slot.
 * 3. Rank by macro fit + variety penalty for recently used meal ids.
 * 4. Avoid reusing a meal within the same day; if every eligible meal is
 *    already used, repeat one (penalized, flagged `reused`) instead of failing.
 */
export function selectMeals(
  allMeals: Meal[],
  slotTargets: SlotTarget[],
  prefs: SelectionPrefs,
  recentlyUsedIds: string[] = [],
): SelectedMeal[] {
  const eligible = allMeals.filter((m) => isEligible(m, prefs));
  if (eligible.length === 0) {
    throw new Error("No meals match your preferences. Loosen a filter or add meals to the database.");
  }

  const usedToday = new Set<string>();
  const recent = new Set(recentlyUsedIds);

  return slotTargets.map((target) => {
    const slotTagged = eligible.filter(
      (m) => m.tags.includes(target.slot) && !usedToday.has(m.id),
    );
    // Fall back to any unused eligible meal if the slot has no tagged options.
    let pool = slotTagged.length > 0 ? slotTagged : eligible.filter((m) => !usedToday.has(m.id));
    if (pool.length === 0) {
      // Every eligible meal is already used today: allow a repeat rather than
      // failing, preferring meals tagged for this slot.
      const slotTaggedUsed = eligible.filter((m) => m.tags.includes(target.slot));
      pool = slotTaggedUsed.length > 0 ? slotTaggedUsed : eligible;
    }

    let best: Meal = pool[0];
    let bestScore = Infinity;
    for (const meal of pool) {
      const score =
        scoreMeal(meal, target) +
        (recent.has(meal.id) ? RECENT_USE_PENALTY : 0) +
        (usedToday.has(meal.id) ? SAME_DAY_REUSE_PENALTY : 0);
      if (score < bestScore) {
        bestScore = score;
        best = meal;
      }
    }

    const reused = usedToday.has(best.id);
    usedToday.add(best.id);
    return {
      meal: best,
      slot: target.slot,
      timeHour: target.timeHour,
      fit: {
        kcalDiff: Math.round(Number(best.kcal) - target.kcal),
        proteinDiff: Math.round(Number(best.protein_g) - target.proteinG),
        score: Number(bestScore.toFixed(3)),
      },
      ...(reused ? { reused: true } : {}),
    };
  });
}
