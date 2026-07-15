-- Phase 5: standalone macro tracker.
-- meal_logs learns the 'fdc' source (USDA FoodData Central foods) and keeps
-- the food's FDC id for provenance and one-tap re-logging. Macros are still
-- snapshotted at log time; the id is reference, not a live pointer.

alter table public.meal_logs drop constraint if exists meal_logs_source_check;
alter table public.meal_logs
  add constraint meal_logs_source_check
  check (source in ('planned', 'db', 'estimate', 'fdc'));

alter table public.meal_logs
  add column if not exists fdc_id integer;
