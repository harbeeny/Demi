# Safety Guidelines

Demi is a general wellness app, not a medical device. These rules are non-negotiable and must be enforced at every layer: system prompt, server-side validation, and UI.

## Hard Limits

### Minimum calorie floors
Never generate or display a daily calorie target below these values, regardless of goal or user input:

| Sex | Minimum kcal/day |
|-----|-----------------|
| Female | 1,200 |
| Male | 1,500 |
| Other / unspecified | 1,200 |

These floors are enforced in `lib/nutrition/targets.ts` and must be validated again in the API route before any plan is persisted or returned to the client.

### No medical claims
The app must never:
- Diagnose, treat, or imply treatment of any medical condition
- Recommend specific supplements beyond whole foods
- Advise on medication or interactions
- Make claims that trigger FDA/FTC oversight (e.g., "cures", "prevents", "treats")

### Eating-disorder safeguards
If user input contains keywords associated with disordered eating (restriction below minimums, purging, laxatives, binging, body dysmorphia), the LLM must:
1. Not engage with the behavior as a goal
2. Affirm the user without judgment
3. Recommend speaking with a qualified healthcare provider or a helpline (e.g., NEDA: 1-800-931-2237)

This keyword list lives in `lib/ai/safety-filter.ts` and is checked server-side before the LLM prompt is constructed.

### No weight-loss advice for minors
If `age < 18`, the calorie target must default to maintenance (TDEE = target), regardless of the stated goal. A note is shown explaining this.

## LLM Guardrails

The system prompt (`lib/trainer.ts`) must always include:
- A directive to avoid medical diagnoses
- A directive to refer users to clinicians for pain, injury, pregnancy, or eating-disorder concerns
- A directive to never invent nutrition numbers (all macros come from the database)

The system prompt must never be overridden by user input. If a user attempts a prompt injection (e.g., "ignore previous instructions"), the server validates the assistant output before returning it to the client.

## Implementation Checklist

- [ ] `lib/nutrition/targets.ts` enforces calorie floors with a thrown error
- [ ] `/api/plan` re-validates targets server-side before persisting
- [ ] `lib/ai/safety-filter.ts` screens user input for eating-disorder keywords
- [ ] System prompt always includes clinician-referral language
- [ ] Age < 18 defaults to maintenance target
- [ ] UI never displays a plan below the calorie floor
- [ ] `SAFETY.md` is reviewed whenever the system prompt or nutrition math changes

## Liability Disclaimer (display in UI)

> Demi provides general wellness information, not medical advice. Always consult a qualified healthcare provider before making significant changes to your diet or exercise routine.

This disclaimer must appear on the onboarding screen, the daily plan view, and the chat interface.
