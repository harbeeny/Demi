-- Phase 6 increment 3: plan generation moves behind a job queue. The row is
-- the contract: enqueue returns instantly, a post-response worker claims and
-- runs it, the client polls status. Owner-scoped RLS throughout; a user
-- tampering with their own job rows can only break their own plan build,
-- and macros still come from the deterministic engine + validated writes.
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('plan', 'week')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  claimed_at timestamptz,
  finished_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
alter table public.jobs enable row level security;
create policy "jobs_select_own" on public.jobs
  for select to authenticated using (auth.uid() = user_id);
create policy "jobs_insert_own" on public.jobs
  for insert to authenticated with check (auth.uid() = user_id);
create policy "jobs_update_own" on public.jobs
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- queue depth and stale-runner sweeps read by status
create index jobs_status_created on public.jobs (status, created_at);
create index jobs_user_kind on public.jobs (user_id, kind, status);
