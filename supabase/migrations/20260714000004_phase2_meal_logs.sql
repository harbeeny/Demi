-- Phase 2: logging & feedback loop.
-- meal_logs is the per-item source of truth for what the user actually ate;
-- daily_logs (already present, unused until now) becomes the daily rollup and
-- carries the end-of-day reflection; plan_events learns 'rebalanced'.

-- meal_logs: one row per logged item. Rows snapshot name and macros at log
-- time so later plan regenerations or swaps cannot rewrite eating history.
create table if not exists public.meal_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles on delete cascade,
  date            date not null,
  slot            text check (slot is null or slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  -- Index of the confirmed entry inside meal_plans.meals. Slot names repeat
  -- (two snacks at 5-6 meals/day), so idempotency must key on the index.
  plan_slot_index integer check (plan_slot_index is null or plan_slot_index >= 0),
  meal_id         uuid references public.meals,
  name            text not null check (char_length(name) between 1 and 120),
  kcal            numeric(7,2) not null check (kcal >= 0 and kcal <= 3000),
  protein_g       numeric(6,2) not null check (protein_g >= 0),
  carbs_g         numeric(6,2) not null check (carbs_g >= 0),
  fat_g           numeric(6,2) not null check (fat_g >= 0),
  source          text not null check (source in ('planned', 'db', 'estimate')),
  note            text,
  logged_at       timestamptz not null default now()
);

create index if not exists meal_logs_user_date_idx
  on public.meal_logs (user_id, date);

-- Tap-to-confirm is idempotent: at most one planned confirmation per plan slot per day.
create unique index if not exists meal_logs_planned_slot_uniq
  on public.meal_logs (user_id, date, plan_slot_index)
  where source = 'planned';

alter table public.meal_logs enable row level security;

create policy "Users can read their own meal logs"
  on public.meal_logs for select using (auth.uid() = user_id);

create policy "Users can insert their own meal logs"
  on public.meal_logs for insert with check (auth.uid() = user_id);

create policy "Users can update their own meal logs"
  on public.meal_logs for update using (auth.uid() = user_id);

-- Un-logging a meal deletes its row; first table that needs a delete policy.
create policy "Users can delete their own meal logs"
  on public.meal_logs for delete using (auth.uid() = user_id);

-- daily_logs grows day-level feedback and the end-of-day reflection.
alter table public.daily_logs
  add column if not exists energy      smallint check (energy is null or energy between 1 and 5),
  add column if not exists day_note    text,
  add column if not exists reflection  text,
  add column if not exists tweak       text,
  add column if not exists finished_at timestamptz;

-- plan_events learns 'rebalanced'.
alter table public.plan_events drop constraint if exists plan_events_event_check;
alter table public.plan_events
  add constraint plan_events_event_check
  check (event in ('regenerated', 'swapped', 'rebalanced'));
