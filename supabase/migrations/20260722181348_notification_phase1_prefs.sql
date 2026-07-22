-- Phase 1 of the notification system: preference plumbing the sender enforces.
--
-- Quiet hours move to fractional local hours (21.5 = 21:30) to match the
-- app-wide timeHour convention; the spec default is 21:30-07:00 and the
-- original whole-hour columns could not represent 21:30. The columns are
-- empty (nothing wrote them yet), so retyping is safe.
alter table public.profiles drop constraint if exists profiles_quiet_hours_start_check;
alter table public.profiles drop constraint if exists profiles_quiet_hours_end_check;
alter table public.profiles alter column quiet_hours_start type real;
alter table public.profiles alter column quiet_hours_end type real;
alter table public.profiles add constraint profiles_quiet_hours_start_check
  check (quiet_hours_start >= 0 and quiet_hours_start < 24);
alter table public.profiles add constraint profiles_quiet_hours_end_check
  check (quiet_hours_end >= 0 and quiet_hours_end < 24);

-- The permanent per-slot kill switch ("Stop sending this one"): one row
-- kills a notification family for this user, for good. Families group send
-- kinds (slot-0/1/2 -> meal-reminder; reflect; balance-morning) and stay
-- open-ended text so future slots need no migration. No update or delete
-- path on purpose: the spec says permanent, no re-ask; the sender treats
-- presence as final.
create table public.notification_kills (
  user_id uuid not null references public.profiles(id) on delete cascade,
  family text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, family)
);

alter table public.notification_kills enable row level security;

create policy "Users can read their own notification kills"
  on public.notification_kills for select using (auth.uid() = user_id);
create policy "Users can insert their own notification kills"
  on public.notification_kills for insert with check (auth.uid() = user_id);
revoke update, delete on public.notification_kills from authenticated, anon;
