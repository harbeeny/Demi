/**
 * SAFETY.md: screen free-text input for signals of disordered eating. On a
 * hit, the app responds supportively, avoids restrictive framing, and points
 * to help. It never engages with the behavior as a goal.
 */

const ED_PATTERNS: RegExp[] = [
  /purg(e|ing)/i,
  /laxative/i,
  /binge|binging|bingeing/i,
  /starv(e|ing|ation)/i,
  /vomit/i,
  /throw(ing)? up after/i,
  /eating disorder/i,
  /anorexi/i,
  /bulimi/i,
  /body dysmorph/i,
  /hate (my|this) body/i,
  /don'?t deserve (to eat|food)/i,
  /punish (myself|my body)/i,
  /earn (my|this) food/i,
  /zero.?calorie day/i,
  /water fast/i,
];

export function containsDisorderedEatingSignal(text: string): boolean {
  return ED_PATTERNS.some((p) => p.test(text));
}

export const SUPPORTIVE_RESPONSE = {
  text:
    "Thank you for trusting me with that. What you're describing deserves more support than a fitness app can give, and you deserve that support. Talking with a clinician or counselor who specializes in eating concerns is a strong next step, and the NEDA helpline (1-800-931-2237) is free and confidential. I'm glad to keep helping with gentle, nourishing routines whenever you're ready.",
  prompts: ["What does balanced eating look like?", "Help me build a gentle routine"],
};
