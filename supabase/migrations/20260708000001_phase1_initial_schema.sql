create extension if not exists pgcrypto;

-- profiles
create table if not exists public.profiles (
  id                   uuid primary key references auth.users on delete cascade,
  created_at           timestamptz not null default now(),
  onboarding_complete  boolean not null default false
);

alter table public.profiles enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- onboarding_answers
create table if not exists public.onboarding_answers (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles on delete cascade,
  sex            text not null check (sex in ('male', 'female', 'other')),
  age            int not null check (age >= 13 and age <= 120),
  height_cm      numeric(5,1) not null check (height_cm > 0),
  weight_kg      numeric(5,1) not null check (weight_kg > 0),
  goal           text not null check (goal in ('lose_fat', 'build_muscle', 'maintain', 'improve_health')),
  activity_level text not null check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  dietary_prefs  text[] not null default '{}',
  allergies      text[] not null default '{}',
  meals_per_day  int not null default 3 check (meals_per_day between 1 and 6),
  created_at     timestamptz not null default now()
);

alter table public.onboarding_answers enable row level security;

create policy "Users can read their own answers"
  on public.onboarding_answers for select using (auth.uid() = user_id);

create policy "Users can insert their own answers"
  on public.onboarding_answers for insert with check (auth.uid() = user_id);

create policy "Users can update their own answers"
  on public.onboarding_answers for update using (auth.uid() = user_id);

-- meals
create table if not exists public.meals (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  kcal       numeric(7,2) not null check (kcal >= 0),
  protein_g  numeric(6,2) not null check (protein_g >= 0),
  carbs_g    numeric(6,2) not null check (carbs_g >= 0),
  fat_g      numeric(6,2) not null check (fat_g >= 0),
  fiber_g    numeric(6,2) not null default 0 check (fiber_g >= 0),
  tags       text[] not null default '{}',
  source     text not null
);

alter table public.meals enable row level security;

create policy "Authenticated users can read meals"
  on public.meals for select to authenticated using (true);

-- meal_plans
create table if not exists public.meal_plans (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles on delete cascade,
  date           date not null,
  generated_at   timestamptz not null default now(),
  llm_rationale  text not null default '',
  meals          jsonb not null default '[]',
  unique (user_id, date)
);

alter table public.meal_plans enable row level security;

create policy "Users can read their own plans"
  on public.meal_plans for select using (auth.uid() = user_id);

create policy "Users can insert their own plans"
  on public.meal_plans for insert with check (auth.uid() = user_id);

create policy "Users can update their own plans"
  on public.meal_plans for update using (auth.uid() = user_id);

-- daily_logs
create table if not exists public.daily_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles on delete cascade,
  date            date not null,
  total_kcal      numeric(7,2) not null check (total_kcal >= 0),
  total_protein_g numeric(6,2) not null check (total_protein_g >= 0),
  total_carbs_g   numeric(6,2) not null check (total_carbs_g >= 0),
  total_fat_g     numeric(6,2) not null check (total_fat_g >= 0),
  created_at      timestamptz not null default now(),
  unique (user_id, date)
);

alter table public.daily_logs enable row level security;

create policy "Users can read their own logs"
  on public.daily_logs for select using (auth.uid() = user_id);

create policy "Users can insert their own logs"
  on public.daily_logs for insert with check (auth.uid() = user_id);

create policy "Users can update their own logs"
  on public.daily_logs for update using (auth.uid() = user_id);
