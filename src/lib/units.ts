/**
 * US-unit display over a metric engine. The database and lib/nutrition stay
 * metric; every conversion happens at the UI boundary through this module.
 */

export const LBS_PER_KG = 2.20462;
export const CM_PER_INCH = 2.54;

export function lbsToKg(lbs: number): number {
  return Number((lbs / LBS_PER_KG).toFixed(1));
}

export function kgToLbs(kg: number): number {
  return Number((kg * LBS_PER_KG).toFixed(1));
}

export function ftInToCm(feet: number, inches: number): number {
  return Number(((feet * 12 + inches) * CM_PER_INCH).toFixed(1));
}

export function inchesToCm(totalInches: number): number {
  return Number((totalInches * CM_PER_INCH).toFixed(1));
}

/** 71 -> 5'11" */
export function formatFtIn(totalInches: number): string {
  return `${Math.floor(totalInches / 12)}'${totalInches % 12}"`;
}

export function cmToFtIn(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cm / CM_PER_INCH);
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

/** Rounded to 2 decimals to fit the goal_rate numeric(3,2) column. */
export function lbPerWeekToKgPerWeek(lb: number): number {
  return Number((lb / LBS_PER_KG).toFixed(2));
}

export function kgPerWeekToLbPerWeek(kg: number): number {
  return Number((kg * LBS_PER_KG).toFixed(1));
}
