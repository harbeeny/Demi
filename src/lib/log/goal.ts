/**
 * Whether a day's calories count as hitting the goal: eaten lands within
 * 90-110% of target. A band, not a floor, on purpose — blowing far past the
 * target fills the progress ring but is not "goal met", and finishing far
 * under it isn't either. Past days are judged against the current target
 * (daily_logs stores only totals), same approximation the rings use.
 */

export const GOAL_BAND_LOW = 0.9;
export const GOAL_BAND_HIGH = 1.1;

export function kcalGoalMet(eatenKcal: number, targetKcal: number): boolean {
  if (targetKcal <= 0 || eatenKcal <= 0) return false;
  const ratio = eatenKcal / targetKcal;
  return ratio >= GOAL_BAND_LOW && ratio <= GOAL_BAND_HIGH;
}
