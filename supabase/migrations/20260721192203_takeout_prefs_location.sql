-- Phase 6.5a: takeout preference layer and coarse region. Both are gated
-- behind the same takeout_experiment runtime flag as the fake-door.

-- Go-to spots: explicit user intent only (picker choices, favorites,
-- hides). Inference from history is computed at read time from meal_logs
-- and takeout_intent_events, not persisted, so this table stays a record
-- of what the user actually said. Full CRUD-own like food_search_cache
-- (upserts need UPDATE; un-hiding deletes the row). chain_name is a code
-- catalog slug; the check bounds charset and length rather than pinning an
-- allowlist that would need a migration per new chain.
create table public.user_takeout_prefs (
  user_id uuid not null references auth.users (id) on delete cascade,
  chain_name text not null check (chain_name ~ '^[a-z0-9_]{2,40}$'),
  affinity text not null default 'liked' check (affinity in ('liked', 'hidden')),
  source text not null default 'picker' check (source in ('picker', 'inferred', 'favorited')),
  updated_at timestamptz not null default now(),
  primary key (user_id, chain_name)
);
alter table public.user_takeout_prefs enable row level security;
create policy "takeout_prefs_select_own" on public.user_takeout_prefs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "takeout_prefs_insert_own" on public.user_takeout_prefs
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "takeout_prefs_update_own" on public.user_takeout_prefs
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "takeout_prefs_delete_own" on public.user_takeout_prefs
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Coarse region for takeout planning: ONE value per user, overwritten in
-- place, so a location trail cannot exist by construction. GPS points are
-- rounded to ~1.1 km client-side before they reach this column
-- (lib/takeout/region.ts); the size check bounds what a hostile client
-- could stuff into its own row. Lives on profiles (RLS self-only already)
-- rather than a second table.
alter table public.profiles add column if not exists takeout_region jsonb
  check (takeout_region is null or pg_column_size(takeout_region) <= 120);
