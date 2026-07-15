-- Marks logs whose nutrition data came from a curated, professionally
-- maintained source (USDA Foundation / SR Legacy / FNDDS today; other
-- verified sources may join later). Cosmetic provenance, not trust-bearing.
alter table public.meal_logs add column if not exists verified boolean not null default false;
