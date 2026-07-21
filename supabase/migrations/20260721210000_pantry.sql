-- Pantry memory for the grocery list. Checking off a line records what the
-- package actually contained (a 10 oz box of couscous, not the 120 g the
-- week needed); the next list subtracts what's still at home. A watermark
-- table tracks how far planned-meal consumption has been deducted.
-- SECURITY.md: RLS on in the same migration, owner-scoped, WITH CHECK on
-- every write, initplan-style (select auth.uid()).

create table public.pantry_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  item text not null check (char_length(item) between 1 and 80),
  unit text not null check (unit in ('g', 'ml', 'count', 'tbsp', 'tsp', 'cup')),
  -- catalog-unit amount on hand; DB backstop bound far above any real kitchen
  qty numeric not null default 0 check (qty >= 0 and qty <= 100000),
  updated_at timestamptz not null default now(),
  primary key (user_id, item, unit)
);

alter table public.pantry_items enable row level security;

create policy "pantry_items_select_own" on public.pantry_items
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "pantry_items_insert_own" on public.pantry_items
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "pantry_items_update_own" on public.pantry_items
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "pantry_items_delete_own" on public.pantry_items
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Planned meals up to and including this date are already deducted.
create table public.pantry_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  consumed_until date not null,
  updated_at timestamptz not null default now()
);

alter table public.pantry_state enable row level security;

create policy "pantry_state_select_own" on public.pantry_state
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "pantry_state_insert_own" on public.pantry_state
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "pantry_state_update_own" on public.pantry_state
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Atomic clamped increment: check-offs, un-checks, and consumption all
-- funnel through here so concurrent writes can't lose an update. SECURITY
-- INVOKER, so the caller's RLS policies apply; the clamp keeps repeated
-- deltas inside the table's qty bounds instead of erroring. updated_at only
-- moves on positive deltas: it means "last restocked", and the client uses
-- it to expire perishable stock instead of trusting week-old chicken.
create or replace function public.pantry_add(p_item text, p_unit text, p_delta numeric)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.pantry_items (user_id, item, unit, qty)
  values ((select auth.uid()), p_item, p_unit, greatest(0, least(100000, p_delta)))
  on conflict (user_id, item, unit) do update
    set qty = greatest(0, least(100000, pantry_items.qty + p_delta)),
        updated_at = case when p_delta > 0 then now() else pantry_items.updated_at end;
$$;

revoke execute on function public.pantry_add(text, text, numeric) from public, anon;
grant execute on function public.pantry_add(text, text, numeric) to authenticated;
