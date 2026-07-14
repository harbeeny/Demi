// No "server-only" here so validateEstimate stays unit-testable; the LLM
// provider (which is server-only and key-bearing) is imported lazily inside
// estimateMacros, keeping it out of any client bundle.

export interface MacroEstimate {
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** one short sentence describing the portion the estimate assumes */
  assumptions: string;
}

// Sanctioned exception to "the LLM never outputs numbers": quick-add estimates
// ARE numbers. The guardrails are these bounds, a visible "estimate" badge in
// the UI, and the user editing the values before anything is saved. If the
// estimate fails, the fallback is manual entry by the user, never a made-up
// number from us.
export const ESTIMATE_BOUNDS = {
  kcalMax: 3000,
  proteinMaxG: 250,
  carbsMaxG: 500,
  fatMaxG: 250,
  nameMaxChars: 120,
} as const;

const SYSTEM = `You are a nutrition estimation assistant. The user describes one food or meal they ate. Estimate its calories and macros for a typical single serving.
These are rough estimates. The user will see them labeled as estimates and can edit every number before saving.

Hard rules:
- Use realistic typical portions. State the portion you assumed in one short sentence.
- Never comment on whether the food is good or bad, never advise eating more or less, never mention weight.
- Never use em-dashes in your writing.
- If the text does not describe food or drink, respond with {"error": "not_food"}.

Respond with ONLY valid JSON, no markdown fences:
{"name": "...", "kcal": 0, "proteinG": 0, "carbsG": 0, "fatG": 0, "assumptions": "..."}`;

function isFiniteNonNegative(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

/**
 * Bounds-check an estimate (from the LLM or from a client re-submitting edited
 * numbers). Returns a normalized estimate or null when anything is off.
 */
export function validateEstimate(e: unknown): MacroEstimate | null {
  if (typeof e !== "object" || e === null) return null;
  const o = e as Record<string, unknown>;

  if (typeof o.name !== "string") return null;
  const name = o.name.trim();
  if (name.length === 0 || name.length > ESTIMATE_BOUNDS.nameMaxChars) return null;

  if (
    !isFiniteNonNegative(o.kcal) ||
    !isFiniteNonNegative(o.proteinG) ||
    !isFiniteNonNegative(o.carbsG) ||
    !isFiniteNonNegative(o.fatG)
  ) {
    return null;
  }
  const { kcal, proteinG, carbsG, fatG } = o as unknown as MacroEstimate;

  if (kcal <= 0 || kcal > ESTIMATE_BOUNDS.kcalMax) return null;
  if (proteinG > ESTIMATE_BOUNDS.proteinMaxG) return null;
  if (carbsG > ESTIMATE_BOUNDS.carbsMaxG) return null;
  if (fatG > ESTIMATE_BOUNDS.fatMaxG) return null;

  // Energy consistency: kcal should roughly match 4/4/9 of the macros.
  const macroKcal = proteinG * 4 + carbsG * 4 + fatG * 9;
  if (Math.abs(kcal - macroKcal) > Math.max(100, 0.25 * kcal)) return null;

  return {
    name,
    kcal: Math.round(kcal),
    proteinG: Math.round(proteinG),
    carbsG: Math.round(carbsG),
    fatG: Math.round(fatG),
    assumptions: typeof o.assumptions === "string" ? o.assumptions : "",
  };
}

/** Ask the LLM for a bounded macro estimate. Null means "use manual entry". */
export async function estimateMacros(text: string): Promise<MacroEstimate | null> {
  try {
    const { getAIProvider } = await import("./anthropic");
    const raw = await getAIProvider().chat({
      system: SYSTEM,
      messages: [{ role: "user", content: text }],
      maxTokens: 512,
    });

    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end <= start) return null;

    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    if (typeof parsed.error === "string") return null;
    return validateEstimate(parsed);
  } catch (err) {
    console.error("estimateMacros: falling back to manual entry:", err);
    return null;
  }
}
