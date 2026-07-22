-- Notification decision log, the pre-Phase-1 foundation of the notification
-- system spec: one row per fired push and one per suppressed (would-have-fired
-- but a rule stopped it) decision, with the reason always recorded. The
-- learning phases depend on this history existing from day one, so it starts
-- with the three push kinds that already fire (slot-N, reflect,
-- balance-morning) and carries the spec's slot vocabulary later.
create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- the user-local day the decision belongs to (the push sender resolves it
  -- from profiles.timezone, matching the app's day boundary)
  date date not null,
  kind text not null,
  fired_at timestamptz,
  -- pending = delivered, not yet interacted with; analysis reads stale
  -- pending as ignored. suppressed rows never fired.
  outcome text not null default 'pending'
    check (outcome in ('pending', 'opened', 'action_taken', 'ignored', 'suppressed')),
  -- which in-app action followed an opened push, when one did
  action text,
  suppression_reason text,
  created_at timestamptz not null default now(),
  -- a suppression always says why; fired rows never carry a reason
  constraint suppressed_iff_reason check (
    (outcome = 'suppressed') = (suppression_reason is not null)
  )
);

-- The cron tick re-evaluates every 15 minutes; these make re-inserts no-ops
-- (23505) instead of duplicate rows. One fired row per user/day/kind; a
-- suppression logs once per distinct reason so a slot can be suppressed
-- early and still fire later the same day.
create unique index notification_events_fired_once
  on public.notification_events (user_id, date, kind)
  where outcome <> 'suppressed';
create unique index notification_events_suppressed_once
  on public.notification_events (user_id, date, kind, suppression_reason)
  where outcome = 'suppressed';

alter table public.notification_events enable row level security;

create policy "Users can read their own notification events"
  on public.notification_events for select using (auth.uid() = user_id);

-- The device reports what happened to a push (tap -> opened, and later which
-- action). Column grant keeps it to exactly that: no rewriting history,
-- no forging fired/suppressed rows (inserts stay service-role only).
create policy "Users can update their own notification events"
  on public.notification_events for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke insert, update, delete on public.notification_events from authenticated, anon;
grant update (outcome, action) on public.notification_events to authenticated;

-- Notification preference fields from the spec's UserProfile (data model
-- only; no behavior reads them yet, enforcement arrives with the phases).
-- Null intensity means the default coach mode; quiet hours are local wall
-- clock hours, overnight ranges (start > end) allowed.
alter table public.profiles add column if not exists notification_intensity text
  check (notification_intensity in ('coach', 'checkin', 'quiet'));
alter table public.profiles add column if not exists quiet_hours_start smallint
  check (quiet_hours_start between 0 and 23);
alter table public.profiles add column if not exists quiet_hours_end smallint
  check (quiet_hours_end between 0 and 23);
