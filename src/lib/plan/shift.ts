// Client-safe: the Capacitor shell computes day targets in the browser from
// the same onboarding row the server routes use, so this must not import
// server-only modules.

import type { ProfileInput } from "@/lib/nutrition";

/** Training days gain this fraction of the base target on 'shift' weeks. */
export const SHIFT_FRACTION = 0.08;
/** Rest-day reductions honor the same gentle rails as weekly balancing. */
const REST_CAP_FRACTION = 0.1;
const REST_CAP_KCAL = 500;

const WEEKDAYS = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
] as const;

export function weekdayNameISO(dateISO: string): string {
  return WEEKDAYS[new Date(`${dateISO}T12:00:00Z`).getUTCDay()];
}

/**
 * Per-date kcal delta for the 'shift' distribution: training days go up by
 * a bump, rest days give the same weekly total back, so the week sums to
 * (nearly) zero; integer rounding can drift by a few kcal per week. The
 * rest-day reduction never exceeds the balancing rails (10%, floor, 500),
 * and the bump shrinks to whatever the rest days can afford. 'even', null,
 * no training days, or training every day all mean no shift.
 */
export function shiftDeltaFor(
  profile: Pick<ProfileInput, "calorieDistribution" | "trainingDays">,
  dateISO: string,
  baseKcal: number,
  floorKcal: number,
): number {
  if (profile.calorieDistribution !== "shift") return 0;
  const training = new Set(profile.trainingDays.map((d) => d.toLowerCase()));
  const nTrain = training.size;
  const nRest = 7 - nTrain;
  if (nTrain === 0 || nRest === 0) return 0;

  const restCap = Math.min(
    Math.round(REST_CAP_FRACTION * baseKcal),
    Math.max(0, baseKcal - floorKcal),
    REST_CAP_KCAL,
  );
  const bump = Math.min(
    Math.round(SHIFT_FRACTION * baseKcal),
    Math.floor((restCap * nRest) / nTrain),
  );
  if (bump <= 0) return 0;

  return training.has(weekdayNameISO(dateISO))
    ? bump
    : -Math.round((bump * nTrain) / nRest);
}
