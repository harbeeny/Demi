// Pure daily rollup math. Client-importable: no "server-only".

import type { MacroTotals } from "./remaining";
import { sumLogged } from "./remaining";

export interface DailyRollup {
  total_kcal: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
}

/** Shape logged items into the daily_logs totals columns. */
export function rollupTotals(logs: MacroTotals[]): DailyRollup {
  const t = sumLogged(logs);
  return {
    total_kcal: Math.round(t.kcal * 100) / 100,
    total_protein_g: Math.round(t.proteinG * 100) / 100,
    total_carbs_g: Math.round(t.carbsG * 100) / 100,
    total_fat_g: Math.round(t.fatG * 100) / 100,
  };
}

export interface PlannedVsActual {
  planned: MacroTotals;
  actual: MacroTotals;
  delta: MacroTotals;
}

export function diffPlannedVsActual(planned: MacroTotals, actual: MacroTotals): PlannedVsActual {
  return {
    planned,
    actual,
    delta: {
      kcal: actual.kcal - planned.kcal,
      proteinG: actual.proteinG - planned.proteinG,
      carbsG: actual.carbsG - planned.carbsG,
      fatG: actual.fatG - planned.fatG,
    },
  };
}
