/**
 * SAFETY.md: the LLM may only explain the plan it was given. It must never
 * introduce nutrition numbers of its own. We enforce that server-side by
 * rejecting any output number that did not appear in the input payload.
 */

import type { Goal } from "@/lib/supabase/types";

/** All numbers in a string, normalized (commas stripped, decimals kept). */
export function extractNumbers(text: string): Set<number> {
  const matches = text.replace(/,(?=\d{3}\b)/g, "").match(/\d+(?:\.\d+)?/g) ?? [];
  return new Set(matches.map(Number));
}

/**
 * True when every number in `output` also appears somewhere in `input`.
 * Small counts (<= 12) are always allowed so phrasing like "three meals" or
 * "2 snacks" written as digits doesn't trigger false rejections.
 */
export function numbersAreGrounded(output: string, input: string): boolean {
  const allowed = extractNumbers(input);
  for (const n of extractNumbers(output)) {
    if (n <= 12) continue;
    if (!allowed.has(n)) return false;
  }
  return true;
}

/**
 * App copy never uses em-dashes; the prompts say so but the model sometimes
 * ignores it, so enforce deterministically on every LLM string we surface.
 */
export function stripEmDashes(text: string): string {
  return text.replace(/\s*—\s*/g, ", ");
}

/**
 * Loss/deficit framing, in the variants the model actually produces.
 * Word boundaries keep innocents like "weightlifting" or "nothing to lose"
 * from matching; "deficit" is matched as a prefix so plurals count too.
 */
const LOSS_PHRASES: RegExp[] = [
  /\bfat[\s-]loss\b/i,
  /\bweight[\s-]loss\b/i,
  /\blos(?:e|ing)\s+(?:body\s+)?(?:weight|fat)\b/i,
  /\bdeficit/i,
  /\bshed(?:ding)?\s+(?:pounds|kilos|weight|fat)\b/i,
  /\bslim(?:ming)?\s+down\b/i,
];

/**
 * True when the copy's framing is consistent with the user's goal. Seen
 * live: a maintain profile was told "while you work toward fat loss".
 * Only a lose_fat goal may be described in loss/deficit terms; maintain,
 * improve_health, and build_muscle copy must never pitch losing.
 */
export function copyMatchesGoal(output: string, goal: Goal): boolean {
  if (goal === "lose_fat") return true;
  return !LOSS_PHRASES.some((re) => re.test(output));
}
