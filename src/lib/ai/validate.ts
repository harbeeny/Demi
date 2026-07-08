/**
 * SAFETY.md: the LLM may only explain the plan it was given. It must never
 * introduce nutrition numbers of its own. We enforce that server-side by
 * rejecting any output number that did not appear in the input payload.
 */

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
