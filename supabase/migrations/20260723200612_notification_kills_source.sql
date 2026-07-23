-- Ignore-decay (Phase 4.2): permanent kills can now come from the decay
-- state machine as well as the user's explicit "Stop sending this one".
-- Provenance matters for the learning phases, so kills carry a source.
alter table public.notification_kills add column if not exists source text not null default 'user'
  check (source in ('user', 'decay'));
