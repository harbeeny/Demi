-- Prep anchor (Phase 3.1): which meals need thawing lead time, so the prep
-- reminder can fire 90 minutes out instead of 60. Curated from ingredient
-- text for the seed catalog; new meals default false, which only means the
-- standard prep window, never a missed reminder.
alter table public.meals add column if not exists requires_thaw boolean not null default false;
update public.meals set requires_thaw = true where ingredients::text ilike '%frozen%';
