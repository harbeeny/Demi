// End-of-day reflection: the LLM writes encouraging, behavior-focused copy
// about the logged day and ONE tweak for tomorrow. Numbers are validated with
// numbersAreGrounded and any failure falls back to deterministic copy, exactly
// like personalize.ts. Pure parts stay testable; the provider loads lazily.

import type { MacroTotals } from "@/lib/log/remaining";
import { numbersAreGrounded } from "./validate";

export interface ReflectionInput {
  targets: MacroTotals;
  /** totals of the day's planned meals; null on a log-only day with no plan */
  planned: MacroTotals | null;
  actual: MacroTotals;
  loggedMeals: Array<{ name: string; slot: string | null; kcal: number; proteinG: number }>;
  energy?: number;
  /** only ever passed after the disordered-eating screen in the route */
  dayNote?: string;
}

export interface DayReflection {
  reflection: string;
  tweak: string;
  /** true when the LLM call failed and deterministic copy was used */
  fallbackUsed: boolean;
}

const SYSTEM = `You are Demi, a warm, evidence-informed nutrition coach writing a short end-of-day reflection.
You receive the user's daily targets, what was planned, what they actually logged, and optionally how their energy felt.

Your job is ONLY to:
1. Write 2-3 encouraging, non-judgmental sentences reflecting on the day. Focus on behavior (they logged, they showed up), not on deficits or surpluses.
2. Suggest ONE small, concrete tweak for tomorrow.

Hard rules:
- Never praise eating less, being under target, or skipping meals. Never present eating less as an achievement.
- Never shame going over target. Treat it as neutral information about the day.
- You may NOT state any calorie or macro numbers other than those given to you.
- Never frame eating as restriction, punishment, or something to be earned.
- No medical claims. If the note mentions pain, injury, pregnancy, or disordered eating, suggest speaking with a clinician, warmly.
- Never use em-dashes in your writing.

Respond with ONLY valid JSON, no markdown fences:
{"reflection": "...", "tweak": "..."}`;

/** The exact payload the LLM sees; exported so tests can assert grounding. */
export function buildReflectionPayload(input: ReflectionInput): object {
  return {
    targets: {
      kcal: Math.round(input.targets.kcal),
      proteinG: Math.round(input.targets.proteinG),
    },
    planned: input.planned
      ? { kcal: Math.round(input.planned.kcal), proteinG: Math.round(input.planned.proteinG) }
      : null,
    actual: {
      kcal: Math.round(input.actual.kcal),
      proteinG: Math.round(input.actual.proteinG),
      mealsLogged: input.loggedMeals.length,
    },
    meals: input.loggedMeals.map((m) => ({
      name: m.name,
      slot: m.slot,
      kcal: Math.round(m.kcal),
      proteinG: Math.round(m.proteinG),
    })),
    energy: input.energy ?? null,
    note: input.dayNote ?? null,
  };
}

/** Deterministic copy used when the LLM is unavailable or returns bad output. */
export function deterministicReflection(input: ReflectionInput): DayReflection {
  const n = input.loggedMeals.length;
  const actualProtein = Math.round(input.actual.proteinG);
  const targetProtein = Math.round(input.targets.proteinG);

  const reflection = `You logged ${n} ${n === 1 ? "meal" : "meals"} today and reached ${actualProtein} g of protein toward your ${targetProtein} g target. Every day you log is information, not a grade.`;

  const proteinGap = targetProtein - actualProtein;
  const kcalRatio = input.targets.kcal > 0 ? input.actual.kcal / input.targets.kcal : 1;
  let tweak: string;
  if (proteinGap > 20) {
    tweak = "Adding one protein-forward snack tomorrow would close most of the protein gap.";
  } else if (kcalRatio < 0.75) {
    tweak = "Tomorrow, aim to fit in each planned meal so your energy stays steady through the day.";
  } else {
    tweak = "Keep the same rhythm tomorrow. Consistency is doing the work.";
  }

  return { reflection, tweak, fallbackUsed: true };
}

/** Ask the LLM to reflect on the day. Falls back to deterministic copy. */
export async function reflect(input: ReflectionInput): Promise<DayReflection> {
  const payload = buildReflectionPayload(input);

  try {
    const { getAIProvider } = await import("./anthropic");
    const raw = await getAIProvider().chat({
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
      maxTokens: 512,
    });

    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end <= start) {
      throw new Error("reflect: no JSON object in LLM response");
    }
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      reflection?: unknown;
      tweak?: unknown;
    };
    if (typeof parsed.reflection !== "string" || typeof parsed.tweak !== "string") {
      throw new Error("reflect: malformed LLM response shape");
    }

    // SAFETY: any number the model wrote must exist in what we sent it.
    const inputText = JSON.stringify(payload);
    if (!numbersAreGrounded(parsed.reflection, inputText) || !numbersAreGrounded(parsed.tweak, inputText)) {
      throw new Error("reflect: LLM invented numbers");
    }

    return { reflection: parsed.reflection, tweak: parsed.tweak, fallbackUsed: false };
  } catch (err) {
    console.error("reflect: falling back to deterministic copy:", err);
    return deterministicReflection(input);
  }
}
