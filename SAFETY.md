# Safety Guidelines

Demi is a general wellness app, not a medical device. These rules are non-negotiable and must be enforced at every layer: system prompt, server-side validation, and UI.

## Hard Limits

### Minimum calorie floors
Never generate or display a daily calorie target below the greater of:

| Sex | Minimum kcal/day |
|-----|-----------------|
| Female | 1,200 |
| Male | 1,500 |
| Other / unspecified | 1,200 |

**and 80% of the user's BMR** (`BMR_FLOOR_FRACTION` in `lib/nutrition/targets.ts`). Anything lower requires medical supervision the app cannot provide. If a goal rate would breach the floor, the target is raised to the floor and the reasoning explains why.

### Maximum loss rate
Suggested loss never exceeds **1% of bodyweight per week** (`MAX_LOSS_RATE_PCT_BW`). Faster requested rates are capped with an explanation; the app never encourages rapid loss, extreme deficits, meal skipping, or fasting for weight loss.

### Underweight protection
If BMI is below 18.5 and the goal is fat loss, the target is set to **maintenance** (`underweightMaintenanceApplied`), with supportive, non-restrictive copy and a resource note in the UI. Restriction is never gamified: no streaks, badges, or praise tied to eating less.

### No medical claims
The app must never:
- Diagnose, treat, or imply treatment of any medical condition
- Recommend specific supplements beyond whole foods
- Advise on medication or interactions
- Make claims that trigger FDA/FTC oversight (e.g., "cures", "prevents", "treats")

### Eating-disorder safeguards
Free-text input is screened server-side (`lib/ai/safety-filter.ts`, wired into `/api/chat`) for signals of disordered eating (purging, laxatives, binging, starving, earning/punishment framing, water fasts, body dysmorphia). On a hit the app:
1. Does not engage with the behavior as a goal
2. Affirms the user without judgment, avoiding restrictive framing
3. Surfaces a supportive resource (NEDA helpline: 1-800-931-2237)

Onboarding is additionally screened structurally: an underweight BMI combined with a fat-loss goal softens the plan to maintenance (see Underweight protection above).

### No weight-loss advice for minors
If `age < 18`, the calorie target must default to maintenance (TDEE = target), regardless of the stated goal. A note is shown explaining this.

## LLM Guardrails

The model may only select among database foods and explain choices. It must never output macro numbers of its own, invent foods, or override the calorie floor.

System prompts (`lib/trainer.ts`, `lib/ai/personalize.ts`) must always include:
- A directive to avoid medical diagnoses
- A directive to refer users to clinicians for pain, injury, pregnancy, or eating-disorder concerns
- A directive to never invent nutrition numbers (all macros come from the database)
- A directive to never frame eating as restriction, punishment, or something to be earned, and never to encourage loss beyond ~1% bodyweight/week

Prompts alone are not trusted. Server-side validation (`lib/ai/personalize.ts` + `lib/ai/validate.ts`) enforces, against the exact plan the model was given:
- Every meal id in the output must match the selected set; ordering is ours, not the model's
- Any number in the output that does not appear in the input payload rejects that piece of copy (deterministic fallback is used instead)
- Any parse or validation failure falls back to deterministic copy; targets are always recomputed server-side from the stored profile

The system prompt must never be overridden by user input. If a user attempts a prompt injection (e.g., "ignore previous instructions"), the server validates the assistant output before returning it to the client.

## Implementation Checklist

- [x] `lib/nutrition/targets.ts` enforces calorie floors: max(sex floor, 0.8 x BMR), flags `flooredBySafety`
- [x] Loss rate capped at 1% bodyweight/week (`rateCappedBySafety`) with explanatory copy
- [x] BMI < 18.5 + fat-loss goal forces maintenance (`underweightMaintenanceApplied`) with supportive UI note and resource
- [x] `/api/plan` recomputes targets server-side from the stored profile on every request — clients can never supply their own numbers
- [x] `lib/ai/safety-filter.ts` screens chat input for eating-disorder signals and responds supportively with a resource
- [x] System prompts include clinician-referral and anti-restriction language (`lib/trainer.ts`, `lib/ai/personalize.ts`)
- [x] LLM output validated server-side: meal ids must match the given plan; numbers not present in the input payload are rejected (`lib/ai/validate.ts`)
- [x] Age < 18 defaults to maintenance target (`minorMaintenanceApplied`)
- [x] UI never displays a plan below the calorie floor (all displayed targets flow from `targets()`)
- [x] Adaptive TDEE corrections are clamped at three layers: proposal time (±200/step, ±500 lifetime in `lib/nutrition/adapt.ts`), a database check constraint, and defensively inside `targets()`; floors always apply after the correction
- [x] Adaptive corrections apply ONLY on explicit user acceptance, and the accept path recomputes the proposal server-side from raw data (`/api/adjust`); stored or client-supplied numbers are never trusted
- [x] Adaptive detection never proposes for minors or underweight users, and never proposes cuts when logging adherence is low, the implied burn is physiologically implausible, or the target already sits at the safety floor (`lib/nutrition/adapt.ts` gates)
- [x] Adaptive copy attributes divergence to the estimate, never the user, and dismissals get a 7-day cooldown; progress UI is never streak-framed
- [ ] `SAFETY.md` is reviewed whenever the system prompt or nutrition math changes

## Liability Disclaimer (display in UI)

> Demi provides general wellness information, not medical advice. Always consult a qualified healthcare provider before making significant changes to your diet or exercise routine.

This disclaimer must appear on the onboarding screen, the daily plan view, and the chat interface.
