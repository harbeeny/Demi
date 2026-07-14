-- Phase 3: weight history and adaptive TDEE corrections.
-- weight_logs holds check-ins; target_adjustments is the proposal audit
-- trail; tdee_correction personalizes the TDEE estimate, bounded here and
-- again inside targets() (defense in depth).

alter table public.onboarding_answers
  add column if not exists tdee_correction integer
    check (tdee_correction is null or tdee_correction between -500 and 500);

create table if not exists public.weight_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles on delete cascade,
  date       date not null,
  weight_kg  numeric(5,1) not null check (weight_kg > 0 and weight_kg < 500),
  created_at timestamptz not null default now(),
  -- multiple check-ins per day upsert; last write wins
  unique (user_id, date)
);

alter table public.weight_logs enable row level security;

create policy "Users can read their own weigh-ins"
  on public.weight_logs for select using (auth.uid() = user_id);

create policy "Users can insert their own weigh-ins"
  on public.weight_logs for insert with check (auth.uid() = user_id);

-- upsert requires update
create policy "Users can update their own weigh-ins"
  on public.weight_logs for update using (auth.uid() = user_id);

create table if not exists public.target_adjustments (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles on delete cascade,
  status           text not null default 'proposed'
                     check (status in ('proposed', 'accepted', 'dismissed')),
  correction_delta integer not null
                     check (correction_delta between -200 and 200 and correction_delta <> 0),
  new_correction   integer not null check (new_correction between -500 and 500),
  window_stats     jsonb not null default '{}',
  rationale        text not null,
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz
);

-- At most one open proposal per user.
create unique index if not exists target_adjustments_one_open
  on public.target_adjustments (user_id) where status = 'proposed';

alter table public.target_adjustments enable row level security;

-- Forged rows are harmless: accept always recomputes from raw data server
-- side, and targets() clamps plus floors bound any stored value.
create policy "Users can read their own adjustments"
  on public.target_adjustments for select using (auth.uid() = user_id);

create policy "Users can insert their own adjustments"
  on public.target_adjustments for insert with check (auth.uid() = user_id);

create policy "Users can update their own adjustments"
  on public.target_adjustments for update using (auth.uid() = user_id);
