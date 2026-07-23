-- "Not cooking today" from the morning brief (Phase 2): a row here turns
-- order mode on for that user-local day; Phase 5 consumes it. Presence is
-- the flag, so delete turns it back off and days expire naturally. Kept
-- out of daily_logs on purpose: that table's totals belong to the
-- reflection flow and require values this action does not have.
create table public.order_mode_days (
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.order_mode_days enable row level security;

create policy "Users can read their own order-mode days"
  on public.order_mode_days for select using (auth.uid() = user_id);
create policy "Users can insert their own order-mode days"
  on public.order_mode_days for insert with check (auth.uid() = user_id);
create policy "Users can delete their own order-mode days"
  on public.order_mode_days for delete using (auth.uid() = user_id);
revoke update on public.order_mode_days from authenticated, anon;
