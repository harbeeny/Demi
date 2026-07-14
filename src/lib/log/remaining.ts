// Pure remaining-budget math. Client-importable: no "server-only".

export interface MacroTotals {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export const ZERO_TOTALS: MacroTotals = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

export function sumLogged(items: MacroTotals[]): MacroTotals {
  return items.reduce(
    (acc, m) => ({
      kcal: acc.kcal + m.kcal,
      proteinG: acc.proteinG + m.proteinG,
      carbsG: acc.carbsG + m.carbsG,
      fatG: acc.fatG + m.fatG,
    }),
    { ...ZERO_TOTALS },
  );
}

/** Signed remaining budget; negative values mean the target has been passed. */
export function remainingBudget(targets: MacroTotals, eaten: MacroTotals): MacroTotals {
  return {
    kcal: targets.kcal - eaten.kcal,
    proteinG: targets.proteinG - eaten.proteinG,
    carbsG: targets.carbsG - eaten.carbsG,
    fatG: targets.fatG - eaten.fatG,
  };
}

/**
 * Neutral, informative copy about what's left today.
 * SAFETY: no praise for eating less, no "over by" framing, no urgency.
 */
export function remainingCopy(remaining: MacroTotals): string {
  if (remaining.kcal > 0) {
    const protein =
      remaining.proteinG > 0 ? ` and ${Math.round(remaining.proteinG)} g protein` : "";
    return `You have ${Math.round(remaining.kcal)} kcal${protein} left today.`;
  }
  return "You've reached your kcal target for today. Tomorrow is a fresh start.";
}
