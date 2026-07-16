-- Weekly balancing: per-day calorie target deltas created when a user
-- spreads an overeaten day across the rest of the week. SECURITY.md:
-- RLS on in the same migration, owner-scoped, WITH CHECK on every write.
create table public.day_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  -- negative = reduction; DB backstop bound, the app caps far tighter (10%)
  kcal_delta integer not null check (kcal_delta between -500 and 500 and kcal_delta <> 0),
  source_date date not null,
  reason text not null default 'balance',
  created_at timestamptz not null default now(),
  unique (user_id, date, source_date)
);

alter table public.day_adjustments enable row level security;

create policy "day_adjustments_select_own" on public.day_adjustments
  for select to authenticated using (auth.uid() = user_id);

create policy "day_adjustments_insert_own" on public.day_adjustments
  for insert to authenticated with check (auth.uid() = user_id);

create policy "day_adjustments_delete_own" on public.day_adjustments
  for delete to authenticated using (auth.uid() = user_id);

create index day_adjustments_user_date on public.day_adjustments (user_id, date);
create index day_adjustments_user_source on public.day_adjustments (user_id, source_date);
