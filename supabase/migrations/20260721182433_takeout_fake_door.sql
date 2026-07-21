-- Phase 6.5: "Order on-plan takeout" fake-door experiment. Demand
-- measurement only: the button deep-links out to the provider's search and
-- this table records the intent tap. No order is ever placed.

-- One row per tap. Owner-scoped like usage_events: the app writes with the
-- caller's client and users can read their own rows back; no update or
-- delete (append-only event log). Every client-supplied text column is
-- bounded by a check (allowlist or length cap), so a hostile client can at
-- worst spam its own rows. goal mirrors onboarding_answers.goal values;
-- had_macro_match records whether the UI showed the confident "fits your
-- macros" badge (false until published chain nutrition data exists; see
-- src/lib/takeout/macro-match.ts).
create table public.takeout_intent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  provider text not null check (provider in ('doordash', 'ubereats')),
  meal_id uuid references public.meals (id) on delete set null,
  dish_query text not null check (char_length(dish_query) between 1 and 200),
  had_macro_match boolean not null,
  goal text check (goal in ('lose_fat', 'build_muscle', 'maintain', 'improve_health')),
  surface text not null check (surface in ('today_screen', 'lazy_empty_state'))
);
alter table public.takeout_intent_events enable row level security;
-- (select auth.uid()) not bare auth.uid(): initplan-once per the live RLS
-- performance pass (20260721180532), so the check doesn't re-run per row.
create policy "takeout_intent_select_own" on public.takeout_intent_events
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "takeout_intent_insert_own" on public.takeout_intent_events
  for insert to authenticated with check ((select auth.uid()) = user_id);
create index takeout_intent_user_created on public.takeout_intent_events (user_id, created_at);
create index takeout_intent_created on public.takeout_intent_events (created_at);

-- The fake-door ships ON behind this runtime flag; operators kill it
-- without a deploy or reinstall via
--   update public.app_config set value = 'false'::jsonb where key = 'takeout_experiment';
insert into public.app_config (key, value)
  values ('takeout_experiment', 'true'::jsonb)
  on conflict (key) do nothing;

-- Operator dashboard (SQL console, PostgREST never exposes private.*):
-- the experiment's headline read. Tap rate = unique tappers / weekly
-- active users (anyone who logged food), trailing 7 days, split by
-- surface plus an "all" rollup row. Decision thresholds live in the PR:
-- >15% build toward integration, 5-15% keep light, <5% drop.
create view private.takeout_tap_rate as
with wau as (
  select count(distinct user_id) as users
  from public.meal_logs
  where date >= current_date - 6
)
select
  coalesce(t.surface, 'all') as surface,
  count(*) as taps,
  count(distinct t.user_id) as tappers,
  (select users from wau) as weekly_active_users,
  round(100.0 * count(distinct t.user_id) / nullif((select users from wau), 0), 1)
    as tap_rate_pct,
  round(100.0 * count(*) filter (where t.had_macro_match) / nullif(count(*), 0), 1)
    as macro_match_pct
from public.takeout_intent_events t
where t.created_at >= now() - interval '7 days'
group by grouping sets ((t.surface), ())
order by surface;

-- Trend + provider split for the same screen.
create view private.takeout_taps_daily as
select
  created_at::date as day,
  surface,
  provider,
  count(*) as taps,
  count(distinct user_id) as tappers,
  count(*) filter (where had_macro_match) as macro_match_taps
from public.takeout_intent_events
group by 1, 2, 3
order by 1 desc, 2, 3;
