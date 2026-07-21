-- Motivation questions from onboarding: prior tracking-app experience and
-- the user's main obstacle. Both nullable; older rows and skips stay null.
alter table public.onboarding_answers
  add column if not exists tried_tracking_apps boolean,
  add column if not exists main_blocker text
  check (
    main_blocker in ('consistency', 'eating_habits', 'support', 'schedule', 'meal_inspiration')
  );
