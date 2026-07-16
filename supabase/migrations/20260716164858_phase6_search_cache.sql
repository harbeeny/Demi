-- Phase 6 increment 2: durable per-user food-search cache (L2 behind the
-- per-instance LRU). Per-user rows on purpose: search results feed macro
-- logging, so a shared cache writable by any authenticated account would
-- let one user poison nutrition data served to others. UPDATE carries
-- WITH CHECK per SECURITY.md so refreshed rows can't be re-assigned.
create table public.food_search_cache (
  user_id uuid not null references auth.users (id) on delete cascade,
  query_key text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, query_key)
);
alter table public.food_search_cache enable row level security;
create policy "food_search_cache_select_own" on public.food_search_cache
  for select to authenticated using (auth.uid() = user_id);
create policy "food_search_cache_insert_own" on public.food_search_cache
  for insert to authenticated with check (auth.uid() = user_id);
create policy "food_search_cache_update_own" on public.food_search_cache
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "food_search_cache_delete_own" on public.food_search_cache
  for delete to authenticated using (auth.uid() = user_id);
create index food_search_cache_created on public.food_search_cache (created_at);
