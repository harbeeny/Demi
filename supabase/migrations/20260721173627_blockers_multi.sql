-- The blockers question is now multi-select: main_blocker (single text)
-- becomes blockers text[]. Existing single answers carry over as one-element
-- arrays before the old column drops.
alter table public.onboarding_answers
  add column if not exists blockers text[] not null default '{}';

update public.onboarding_answers
  set blockers = array[main_blocker]
  where main_blocker is not null and blockers = '{}';

alter table public.onboarding_answers drop column if exists main_blocker;

-- Cardinality cap: containment alone would admit arbitrarily long arrays of
-- repeated allowed values from a forged request.
alter table public.onboarding_answers
  add constraint onboarding_answers_blockers_check
  check (cardinality(blockers) <= 5
    and blockers <@ array['consistency', 'eating_habits', 'support', 'schedule', 'meal_inspiration']);
