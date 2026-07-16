import "server-only";

import type { Database, MealPlanEntry } from "@/lib/supabase/types";
import { calorieFloor, distribute, targets } from "@/lib/nutrition";
import { applyKcalDeltaToTargets } from "@/lib/log/balance";
import { selectMeals, type Meal, type SelectionPrefs } from "./select-meals";
import { createHash } from "node:crypto";

import {
  buildPersonalizePayload,
  deterministicFallback,
  personalize,
  type PersonalizedPlan,
} from "@/lib/ai/personalize";

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
/** Phrasing-cache hooks; the key is a hash of the exact prompt payload. */
export interface PhrasingCache {
  load(key: string): Promise<PersonalizedPlan | null>;
  save(key: string, plan: PersonalizedPlan): Promise<void>;
}

export interface GenerateOptions {
  /** hard cap on prep_min + cook_min for eligible meals */
  maxPrepMin?: number;
  /** false = deterministic copy only (used for far-future week days) */
  personalizeWithLLM?: boolean;
  /** day_adjustments sum for this date (weekly balancing); floors still apply */
  kcalDelta?: number;
  /** reuse identical phrasing instead of re-billing the model for it */
  phrasingCache?: PhrasingCache;
  /** clock preference for time labels in copy; null/absent means 12-hour */
  prefers24h?: boolean | null;
}

/** Stable content hash of the personalize prompt payload. */
export function phrasingCacheKey(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function generatePlan(
  row: OnboardingRow,
  allMeals: Meal[],
  today: Date,
  recentlyUsedIds: string[] = [],
  opts: GenerateOptions = {},
): Promise<GeneratedPlan> {
  const profile = profileFromRow(row);
  const dayTargets = applyKcalDeltaToTargets(
    targets(profile, { displayUnits: "us" }),
    opts.kcalDelta ?? 0,
    calorieFloor(profile),
  );
  const slotTargets = distribute(dayTargets, profile, today, opts.prefers24h);
  const prefs = { ...prefsFromRow(row), maxPrepMin: opts.maxPrepMin };
  const selected = selectMeals(allMeals, slotTargets, prefs, recentlyUsedIds);

  // Same meals + targets + profile = the same prompt, so cached copy is
  // byte-equivalent to what the model would be asked to produce. Cache
  // problems must never break generation; they only cost a model call.
  const cacheKey =
    opts.personalizeWithLLM !== false && opts.phrasingCache
      ? phrasingCacheKey(buildPersonalizePayload(selected, dayTargets, profile, opts.prefers24h))
      : null;
  let cached: PersonalizedPlan | null = null;
  if (cacheKey && opts.phrasingCache) {
    cached = await opts.phrasingCache.load(cacheKey).catch(() => null);
  }

  const rationale =
    opts.personalizeWithLLM === false
      ? deterministicFallback(selected, dayTargets, opts.prefers24h)
      : (cached ?? (await personalize(selected, dayTargets, profile, opts.prefers24h)));

  // Only real model output is worth keeping (fallback copy is free).
  if (cacheKey && opts.phrasingCache && !cached && !rationale.fallbackUsed) {
    await opts.phrasingCache.save(cacheKey, rationale).catch(() => undefined);
  }

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
