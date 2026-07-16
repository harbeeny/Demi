-- Phase 6 increment 1: LLM spend visibility, global kill switch, phrasing cache.

-- Every model call logs tokens and estimated cost. Owner-scoped: users can
-- read their own usage (future usage screen) and the server writes with the
-- caller's client, so WITH CHECK pins rows to their author. No update/delete.
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  model text not null,
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  est_cost_usd numeric(10, 6) not null check (est_cost_usd >= 0),
  created_at timestamptz not null default now()
);
alter table public.usage_events enable row level security;
create policy "usage_events_select_own" on public.usage_events
  for select to authenticated using (auth.uid() = user_id);
create policy "usage_events_insert_own" on public.usage_events
  for insert to authenticated with check (auth.uid() = user_id);
create index usage_events_user_created on public.usage_events (user_id, created_at);
create index usage_events_created on public.usage_events (created_at);

-- Global runtime flags. Readable by signed-in users (nothing secret lives
-- here); writable by nobody through PostgREST -- flips happen via SQL as the
-- operator. llm_disabled=true is the kill switch every LLM route checks.
create table public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
create policy "app_config_select_authenticated" on public.app_config
  for select to authenticated using (true);
insert into public.app_config (key, value) values ('llm_disabled', 'false'::jsonb);

-- Phrasing cache for plan generation: identical prompt inputs reuse the
-- model's copy instead of paying for it again. Per-user on purpose: a
-- shared cache would let any account poison copy other users see.
create table public.plan_cache (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.plan_cache enable row level security;
create policy "plan_cache_select_own" on public.plan_cache
  for select to authenticated using (auth.uid() = user_id);
create policy "plan_cache_insert_own" on public.plan_cache
  for insert to authenticated with check (auth.uid() = user_id);
create policy "plan_cache_delete_own" on public.plan_cache
  for delete to authenticated using (auth.uid() = user_id);
