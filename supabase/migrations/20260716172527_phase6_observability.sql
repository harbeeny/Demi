-- Phase 6 increment 5: operator observability. Everything lives in the
-- private schema (PostgREST never exposes it): these are SQL-console
-- dashboards and cron jobs, not client surface.

-- LLM spend by day and feature.
create view private.llm_spend_daily as
select
  created_at::date as day,
  kind,
  count(*) as calls,
  sum(input_tokens) as input_tokens,
  sum(output_tokens) as output_tokens,
  round(sum(est_cost_usd), 4) as est_cost_usd
from public.usage_events
group by 1, 2
order by 1 desc, 2;

-- Queue health at a glance: per-status counts and the oldest waiting job.
create view private.queue_health as
select
  status,
  count(*) as jobs,
  min(created_at) as oldest,
  round(extract(epoch from (now() - min(created_at)))) as oldest_age_s
from public.jobs
group by 1;

-- Spend backstop: if today's estimated LLM cost crosses the ceiling, flip
-- the kill switch. Plans and reflections degrade to deterministic copy;
-- estimate/label pause. The operator flips it back after investigating.
create function private.check_llm_spend(limit_usd numeric default 5.0)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare today_usd numeric;
begin
  select coalesce(sum(est_cost_usd), 0) into today_usd
  from public.usage_events
  where created_at >= date_trunc('day', now());
  if today_usd > limit_usd then
    update public.app_config
    set value = 'true'::jsonb, updated_at = now()
    where key = 'llm_disabled' and value <> 'true'::jsonb;
    return true;
  end if;
  return false;
end;
$$;
revoke execute on function private.check_llm_spend(numeric) from public, anon, authenticated;

-- Retention: terminal jobs after 7 days, push dedupe rows after 30,
-- search cache rows a day past their longest TTL (8 days). usage_events
-- and meal_logs are kept indefinitely for now; the archival plan is
-- documented in OBSERVABILITY.md.
create function private.prune_ops_tables()
returns table (jobs_deleted bigint, push_sends_deleted bigint, search_cache_deleted bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare j bigint; p bigint; c bigint;
begin
  delete from public.jobs
    where status in ('done', 'failed') and created_at < now() - interval '7 days';
  get diagnostics j = row_count;
  delete from public.push_sends where date < (now() - interval '30 days')::date;
  get diagnostics p = row_count;
  delete from public.food_search_cache where created_at < now() - interval '8 days';
  get diagnostics c = row_count;
  return query select j, p, c;
end;
$$;
revoke execute on function private.prune_ops_tables() from public, anon, authenticated;

-- Schedules: spend backstop every 30 minutes, retention pruning nightly.
select cron.schedule('llm-spend-backstop', '*/30 * * * *', $$select private.check_llm_spend(5.0)$$);
select cron.schedule('prune-ops-tables', '10 4 * * *', $$select private.prune_ops_tables()$$);
