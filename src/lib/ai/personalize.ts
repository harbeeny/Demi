import "server-only";

import type { SelectedMeal } from "@/lib/plan/select-meals";
import type { MacroTargets, ProfileInput } from "@/lib/nutrition";
import { getAIProvider } from "./anthropic";

export interface PersonalizedPlan {
  daySummary: string;
  meals: Array<{
    mealId: string;
    why: string;
  }>;
  /** true when the LLM call failed and deterministic copy was used */
  fallbackUsed: boolean;
}

const SYSTEM = `You are Demi, a warm, evidence-informed nutrition coach.
You will receive a user's daily macro targets, their profile, and a fixed list of meals already selected from a verified database.

Your job is ONLY to:
1. Write a 1-2 sentence summary of the day's eating strategy.
2. For each meal, write ONE short sentence explaining why this meal, at this time, for this person.

Hard rules:
- You may NOT change, add, remove, or reorder meals.
- You may NOT state any calorie or macro numbers other than those given.
- Never use em-dashes in your writing.
- No medical claims. Warm, direct, non-judgmental tone.

Respond with ONLY valid JSON, no markdown fences:
{"daySummary": "...", "meals": [{"mealId": "...", "why": "..."}]}`;

function timeLabel(timeHour: number): string {
  const h = Math.floor(timeHour);
  const m = Math.round((timeHour % 1) * 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** Deterministic copy used when the LLM is unavailable or returns bad output. */
export function deterministicFallback(selected: SelectedMeal[], targets: MacroTargets): PersonalizedPlan {
  return {
    daySummary: `Today is built around ${targets.proteinG.value} g of protein across ${selected.length} meals, inside your ${targets.kcal.value} kcal target. ${targets.kcal.reasoning.explanation}`,
    meals: selected.map((s) => ({
      mealId: s.meal.id,
      why: `${s.meal.name} fits your ${s.slot} target (${Math.round(Number(s.meal.protein_g))} g protein) at ${timeLabel(s.timeHour)}.`,
    })),
    fallbackUsed: true,
  };
}

/**
 * Ask the LLM to explain the plan. The LLM cannot alter it: output is
 * validated so every meal id must match the selected set exactly, and any
 * failure falls back to deterministic copy.
 */
export async function personalize(
  selected: SelectedMeal[],
  targets: MacroTargets,
  profile: ProfileInput,
): Promise<PersonalizedPlan> {
  const payload = {
    profile: {
      goal: profile.goal,
      activityLevel: profile.activityLevel,
      mealsPerDay: profile.mealsPerDay,
    },
    targets: {
      kcal: targets.kcal.value,
      proteinG: targets.proteinG.value,
      carbsG: targets.carbsG.value,
      fatG: targets.fatG.value,
      whyKcal: targets.kcal.reasoning.explanation,
    },
    meals: selected.map((s) => ({
      mealId: s.meal.id,
      name: s.meal.name,
      slot: s.slot,
      time: timeLabel(s.timeHour),
      kcal: Number(s.meal.kcal),
      proteinG: Number(s.meal.protein_g),
      carbsG: Number(s.meal.carbs_g),
      fatG: Number(s.meal.fat_g),
    })),
  };

  try {
    const raw = await getAIProvider().chat({
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
      maxTokens: 1024,
    });

    // Models sometimes wrap JSON in ```json fences despite instructions.
    // Parse the outermost object rather than trusting the raw string.
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end <= start) {
      throw new Error("personalize: no JSON object in LLM response");
    }
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { daySummary?: unknown; meals?: unknown };
    if (typeof parsed.daySummary !== "string" || !Array.isArray(parsed.meals)) {
      throw new Error("personalize: malformed LLM response shape");
    }

    const expectedIds = selected.map((s) => s.meal.id);
    const gotIds = parsed.meals.map((m) => (m as { mealId?: unknown }).mealId);
    const sameSet =
      gotIds.length === expectedIds.length && expectedIds.every((id) => gotIds.includes(id));
    if (!sameSet) {
      throw new Error("personalize: LLM returned meal ids outside the selected set");
    }

    const explanations = new Map(
      (parsed.meals as Array<{ mealId: string; why?: unknown }>).map((m) => [
        m.mealId,
        typeof m.why === "string" ? m.why : "",
      ]),
    );

    return {
      daySummary: parsed.daySummary,
      // Preserve OUR ordering; the LLM explains, it does not reorder.
      meals: selected.map((s) => ({
        mealId: s.meal.id,
        why: explanations.get(s.meal.id) || deterministicFallback([s], targets).meals[0].why,
      })),
      fallbackUsed: false,
    };
  } catch (err) {
    console.error("personalize: falling back to deterministic copy:", err);
    return deterministicFallback(selected, targets);
  }
}
