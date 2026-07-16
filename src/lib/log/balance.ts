import type { MacroTargets } from "@/lib/nutrition";
import type { MacroTotals } from "./remaining";

/**
 * Weekly balancing: spread an overeaten day's surplus across the remaining
 * days of the same calendar week (Monday-start), gently. Hard rules:
 *
 * - Each future day gives up at most 10% of the daily target, and never
 *   drops below the safety floor (SAFETY.md).
 * - Whatever the caps can't absorb is forgiven, not carried: aggressive
 *   compensation is the restrict-binge pattern the app screens against.
 * - Protein is never reduced; carbs and fat absorb the cut (overeating is
 *   carbs, fat, and alcohol at 7 kcal/g, conventionally counted as carbs).
 */

export const BALANCE_CAP_FRACTION = 0.1;
/** absolute per-day bound, mirrored by the DB check constraint (±500) */
export const BALANCE_CAP_KCAL = 500;

export interface SpreadDay {
  date: string;
  /** negative: kcal removed from this day's target */
  deltaKcal: number;
}

export interface SpreadPlan {
  days: SpreadDay[];
  absorbed: number;
  forgiven: number;
}

function addDaysISO(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Dates strictly after sourceDate through Sunday of the same Monday-start week. */
export function remainingWeekDates(sourceDate: string): string[] {
  const dow = new Date(`${sourceDate}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  const left = dow === 0 ? 0 : 7 - dow;
  return Array.from({ length: left }, (_, i) => addDaysISO(sourceDate, i + 1));
}

export function planSpread(opts: {
  overageKcal: number;
  sourceDate: string;
  targetKcal: number;
  floorKcal: number;
  /**
   * kcal already being shaved off each date by earlier balances (positive
   * numbers). Each day's cap applies to the SUM of reductions, so stacked
   * balances in one week cannot pile past 10%; what no longer fits is
   * forgiven rather than redistributed (gentleness over recovery speed).
   */
  existingReductionByDate?: Record<string, number>;
}): SpreadPlan {
  const overage = Math.round(opts.overageKcal);
  const dates = remainingWeekDates(opts.sourceDate);
  const cap = Math.min(
    Math.round(BALANCE_CAP_FRACTION * opts.targetKcal),
    Math.max(0, opts.targetKcal - opts.floorKcal),
    BALANCE_CAP_KCAL,
  );
  if (overage <= 0 || dates.length === 0 || cap <= 0) {
    return { days: [], absorbed: 0, forgiven: Math.max(0, overage) };
  }

  const base = Math.floor(overage / dates.length);
  const remainder = overage % dates.length;
  const days = dates
    .map((date, i) => {
      const capLeft = Math.max(0, cap - (opts.existingReductionByDate?.[date] ?? 0));
      return { date, deltaKcal: -Math.min(capLeft, base + (i < remainder ? 1 : 0)) };
    })
    .filter((d) => d.deltaKcal < 0);
  const absorbed = days.reduce((sum, d) => sum - d.deltaKcal, 0);
  return { days, absorbed, forgiven: overage - absorbed };
}

/**
 * Apply a day's kcal delta to macro targets: protein untouched, fat gives
 * up its calorie-share of the cut, carbs fill the remainder (the same
 * "carbs fill" rule targets() uses). Never returns kcal below the floor.
 */
export function applyKcalDelta(
  totals: MacroTotals,
  deltaKcal: number,
  floorKcal: number,
): MacroTotals {
  const newKcal = Math.max(floorKcal, totals.kcal + deltaKcal);
  if (newKcal === totals.kcal) return totals;

  const reduction = totals.kcal - newKcal;
  const carbKcal = totals.carbsG * 4;
  const fatKcal = totals.fatG * 9;
  const fatShare = carbKcal + fatKcal > 0 ? fatKcal / (carbKcal + fatKcal) : 0;
  const fatG = Math.max(0, totals.fatG - Math.round((reduction * fatShare) / 9));
  const carbsG = Math.max(0, Math.round((newKcal - totals.proteinG * 4 - fatG * 9) / 4));
  return { kcal: newKcal, proteinG: totals.proteinG, carbsG, fatG };
}

/**
 * Same adjustment applied to the rich Reasoned targets the planner uses.
 * Values move; reasoning strings stay as the baseline explanation (the UI
 * explains the balance separately).
 */
export function applyKcalDeltaToTargets(
  t: MacroTargets,
  deltaKcal: number,
  floorKcal: number,
): MacroTargets {
  if (!deltaKcal) return t;
  const adjusted = applyKcalDelta(
    { kcal: t.kcal.value, proteinG: t.proteinG.value, carbsG: t.carbsG.value, fatG: t.fatG.value },
    deltaKcal,
    floorKcal,
  );
  return {
    ...t,
    kcal: { ...t.kcal, value: adjusted.kcal },
    carbsG: { ...t.carbsG, value: adjusted.carbsG },
    fatG: { ...t.fatG, value: adjusted.fatG },
  };
}
