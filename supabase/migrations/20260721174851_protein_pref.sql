-- Preferred protein tier from onboarding. Null (skip / older rows) behaves
-- as 'moderate', which is the pre-existing per-goal anchor.
alter table public.onboarding_answers
  add column if not exists protein_pref text
  check (protein_pref in ('low', 'moderate', 'high', 'extra_high'));
