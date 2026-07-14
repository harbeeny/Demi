-- Phase 2.5: native push notifications.
-- device_tokens holds APNs tokens per user; push_sends is the send-dedup
-- ledger written only by the service-role edge function.

create table if not exists public.device_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles on delete cascade,
  token      text not null unique,
  platform   text not null default 'ios' check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

create index if not exists device_tokens_user_idx on public.device_tokens (user_id);

alter table public.device_tokens enable row level security;

create policy "Users manage their own device tokens"
  on public.device_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.push_sends (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  date    date not null,
  kind    text not null,  -- 'slot-<index>' or 'reflect'
  sent_at timestamptz not null default now(),
  unique (user_id, date, kind)
);

-- RLS on with NO policies: only the service-role edge function reads/writes.
alter table public.push_sends enable row level security;
