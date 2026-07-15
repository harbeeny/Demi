-- Security baseline hardening (see SECURITY.md).
-- 1. Per-user daily usage caps for paid/expensive endpoints (LLM + FDC proxy),
--    enforced in a schema PostgREST does not expose so users can't reset them.
-- 2. Track and lock down the Vault-reading get_push_secret() function.
-- 3. Revoke RPC execute on the handle_new_user() trigger function.
-- 4. Make WITH CHECK explicit on UPDATE policies (baseline: WITH CHECK on writes).

-- 1. Usage counters ---------------------------------------------------------

create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists private.usage_counters (
  user_id uuid not null,
  day date not null default current_date,
  bucket text not null,
  calls int not null default 0,
  primary key (user_id, day, bucket)
);

-- Atomic check-and-increment. Returns true when the caller is under the cap
-- (and records the call), false when the cap is already reached. Keyed on
-- auth.uid() so a caller can neither bill another user nor tamper with the
-- counter (the table lives in the unexposed `private` schema).
create or replace function public.consume_quota(p_bucket text, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  new_calls int;
begin
  if uid is null then
    return false;
  end if;

  insert into private.usage_counters (user_id, day, bucket, calls)
  values (uid, current_date, p_bucket, 1)
  on conflict (user_id, day, bucket)
  do update set calls = private.usage_counters.calls + 1
    where private.usage_counters.calls < p_limit
  returning calls into new_calls;

  -- No row returned means the conflict update was skipped by its WHERE, i.e.
  -- the cap was already reached.
  return new_calls is not null;
end;
$$;

revoke all on function public.consume_quota(text, int) from public, anon;
grant execute on function public.consume_quota(text, int) to authenticated;

-- 2. get_push_secret: own it in source, scope it to push_* secrets, and make
--    execute service-role-only (matches the live grants; now reproducible).
create or replace function public.get_push_secret(secret_name text)
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = secret_name
    and name like 'push\_%'
$$;

revoke all on function public.get_push_secret(text) from public, anon, authenticated;
grant execute on function public.get_push_secret(text) to service_role;

-- 3. handle_new_user is a trigger function; nothing should call it via RPC.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- 4. Explicit WITH CHECK on every UPDATE policy so an update can never move a
--    row to another owner. (Postgres already reuses USING as the check when
--    WITH CHECK is absent; this makes the intent explicit and audit-visible.)
alter policy "Users can update their own logs"        on public.daily_logs         with check (auth.uid() = user_id);
alter policy "Users can update their own meal logs"   on public.meal_logs          with check (auth.uid() = user_id);
alter policy "Users can update their own plans"       on public.meal_plans         with check (auth.uid() = user_id);
alter policy "Users can update their own answers"     on public.onboarding_answers with check (auth.uid() = user_id);
alter policy "Users can update their own profile"     on public.profiles           with check (auth.uid() = id);
alter policy "Users can update their own adjustments" on public.target_adjustments with check (auth.uid() = user_id);
alter policy "Users can update their own weigh-ins"   on public.weight_logs        with check (auth.uid() = user_id);
