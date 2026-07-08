alter table public.onboarding_answers
  add column if not exists goal_rate           numeric(3,2) check (goal_rate is null or (goal_rate >= 0 and goal_rate <= 1.0)),
  add column if not exists eating_window_start int not null default 8  check (eating_window_start between 0 and 23),
  add column if not exists eating_window_end   int not null default 20 check (eating_window_end between 1 and 24),
  add column if not exists dislikes            text[] not null default '{}',
  add column if not exists budget              text not null default 'medium' check (budget in ('low','medium','high')),
  add column if not exists cooking_skill       text not null default 'basic' check (cooking_skill in ('minimal','basic','confident')),
  add column if not exists training_days       text[] not null default '{}',
  add column if not exists training_time       time,
  add constraint eating_window_valid check (eating_window_end > eating_window_start);

create table if not exists public.plan_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles on delete cascade,
  plan_id    uuid not null references public.meal_plans on delete cascade,
  event      text not null check (event in ('regenerated','swapped')),
  meal_slot  text,
  created_at timestamptz not null default now()
);

alter table public.plan_events enable row level security;

create policy "Users can read their own plan events"
  on public.plan_events for select using (auth.uid() = user_id);

create policy "Users can insert their own plan events"
  on public.plan_events for insert with check (auth.uid() = user_id);
