/**
 * Honesty guardrail for the takeout fake-door (SAFETY.md: never surface a
 * nutrition number we can't source). Demi's meal macros describe the
 * home-cooked recipe; a restaurant's version of the same dish is a
 * different food. Until the data model carries published per-chain
 * nutrition, which nothing does today, no dish qualifies for the confident
 * "fits your macros" badge and the UI labels macros as estimates instead.
 * This gate is the single switch to flip when real chain data lands.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the meal is the future data dependency
export function hasPublishedNutrition(_meal: { name: string; mealId: string | null }): boolean {
  return false;
}
