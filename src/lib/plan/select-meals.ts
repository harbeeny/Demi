import type { Database, MealSlot } from "@/lib/supabase/types";
import type { SlotTarget } from "@/lib/nutrition";

export type Meal = Database["public"]["Tables"]["meals"]["Row"];

export interface SelectionPrefs {
  dietaryPrefs: string[]; // e.g. ["vegetarian"]; every pref must be satisfied (see DIET_SATISFIES)
  allergies: string[]; // substring-matched against name + tags, meal excluded on hit
  dislikes: string[]; // substring-matched against name, meal excluded on hit
  budget: "low" | "medium" | "high";
  cookingSkill: "minimal" | "basic" | "confident";
  /** hard cap on prep_min + cook_min; undefined = no cap */
  maxPrepMin?: number;
  /** onboarding obstacles; soft scoring nudges, never hard filters */
  blockers?: string[];
  /** protein tier; high tiers weight protein fit harder */
  proteinPref?: "low" | "moderate" | "high" | "extra_high" | null;
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

  // Total time cap (inclusive: a 30-minute meal passes a 30-minute cap).
  if (
    prefs.maxPrepMin != null &&
    Number(meal.prep_min) + Number(meal.cook_min) > prefs.maxPrepMin
  ) {
    return false;
  }

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
 * Protein misses hurt more than carb/fat misses (protein is the anchor), and
 * harder still for users who chose a high protein preference.
 */
export function scoreMeal(meal: Meal, target: SlotTarget, proteinWeight = 1.5): number {
  const kcalDiff = Math.abs(Number(meal.kcal) - target.kcal) / Math.max(target.kcal, 1);
  const proteinDiff = Math.abs(Number(meal.protein_g) - target.proteinG) / Math.max(target.proteinG, 1);
  const carbsDiff = Math.abs(Number(meal.carbs_g) - target.carbsG) / Math.max(target.carbsG, 1);
  const fatDiff = Math.abs(Number(meal.fat_g) - target.fatG) / Math.max(target.fatG, 1);
  return kcalDiff * 1.0 + proteinDiff * proteinWeight + carbsDiff * 0.5 + fatDiff * 0.5;
}

/** Penalty added to meals used recently, to force variety. */
const RECENT_USE_PENALTY = 0.75;
/** Repetition is a feature when consistency is the struggle: familiar food, less friction. */
const RECENT_USE_PENALTY_CONSISTENCY = 0.3;
/** Bored eaters get a harder push toward variety. */
const MEAL_INSPIRATION_EXTRA_PENALTY = 0.5;
/** Busy users: cost per minute of total time beyond this threshold. */
const QUICK_MEAL_THRESHOLD_MIN = 20;
const SLOW_MEAL_PENALTY_PER_MIN = 0.012;
/** Habits blocker: reward fiber-dense meals (14 g per 1,000 kcal pace or better). */
const FIBER_DENSITY_BONUS = 0.15;

/** Soft score adjustments from onboarding blockers and protein preference. */
export function prefAdjustments(meal: Meal, prefs: SelectionPrefs, isRecent: boolean): number {
  const blockers = prefs.blockers ?? [];
  let adjust = 0;

  if (isRecent) {
    let recentPenalty = blockers.includes("consistency")
      ? RECENT_USE_PENALTY_CONSISTENCY
      : RECENT_USE_PENALTY;
    if (blockers.includes("meal_inspiration")) recentPenalty += MEAL_INSPIRATION_EXTRA_PENALTY;
    adjust += recentPenalty;
  }

  if (blockers.includes("schedule")) {
    const totalMin = Number(meal.prep_min) + Number(meal.cook_min);
    adjust += Math.max(0, totalMin - QUICK_MEAL_THRESHOLD_MIN) * SLOW_MEAL_PENALTY_PER_MIN;
  }

  if (blockers.includes("eating_habits")) {
    const fiberPace = (Number(meal.kcal) / 1000) * 14;
    if (Number(meal.fiber_g) >= fiberPace) adjust -= FIBER_DENSITY_BONUS;
  }

  return adjust;
}

/** Protein-fit weight for the user's tier; high tiers care more about hitting protein. */
export function proteinWeightFor(pref: SelectionPrefs["proteinPref"]): number {
  return pref === "extra_high" ? 2.0 : pref === "high" ? 1.75 : 1.5;
}

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

    const proteinWeight = proteinWeightFor(prefs.proteinPref);
    let best: Meal = pool[0];
    let bestScore = Infinity;
    for (const meal of pool) {
      const score =
        scoreMeal(meal, target, proteinWeight) +
        prefAdjustments(meal, prefs, recent.has(meal.id)) +
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
