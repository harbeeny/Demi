-- Self-assessed body fat range from the onboarding visual picker (midpoint %).
-- Null means the user skipped; targets fall back to Mifflin-St Jeor.
alter table public.onboarding_answers
  add column if not exists body_fat_pct int
  check (body_fat_pct between 3 and 70);
