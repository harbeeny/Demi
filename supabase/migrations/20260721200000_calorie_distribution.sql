-- Weekly calorie distribution preference: 'shift' raises training days and
-- eases rest days by the same weekly total; 'even' (and null, for older
-- rows) keeps every day identical.
alter table public.onboarding_answers
  add column if not exists calorie_distribution text
  check (calorie_distribution in ('shift', 'even'));
