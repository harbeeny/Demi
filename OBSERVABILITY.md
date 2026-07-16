# Observability

Where every operational signal lives, what watches it automatically, and the
data-growth plan. Phase 6 increment 5.

## Signal map

| Signal | Where | How |
|---|---|---|
| Request latency + error rate | Vercel function logs | Every API request logs one JSON line (`{"at":"api",route,method,status,ms}`) from the `withCors` choke point; ≥400 and slow (>3s) requests log as warnings, ≥500 as errors. Filter on `at:api` in the Vercel log UI. |
| Uncaught route errors | Vercel function logs | `captureError` in `src/lib/obs.ts` logs `{"at":"error",...}` with the stack and answers a generic 500. This function is the single splice point if Sentry is added later (`bun add @sentry/nextjs`, set `SENTRY_DSN`, call it inside `captureError`). |
| Liveness / DB reachability | `GET /api/health` | Unauthenticated, booleans only (`{ok, db, ms}`), 503 when the DB probe fails. Point an uptime monitor at it. |
| LLM spend | `private.llm_spend_daily` view | Per day and per feature (plan/week/estimate/reflect/label): calls, tokens, estimated USD. Source of truth: `usage_events`, written by the meter on every model call. |
| Queue depth / stuck jobs | `private.queue_health` view | Jobs per status plus the oldest waiting job's age. A growing `queued` count or an old `running` row means workers aren't keeping up (polls self-heal stale runners). |
| Push delivery | Edge function logs | Every sender tick logs `push tick: {considered,sent,failed,pruned,released,tookMs}`. Read via the Supabase functions log UI or `get_logs(service=edge-function)`. |
| DB connections / CPU / IO | Supabase dashboard | Built-in; nothing to build. The app uses PostgREST only (no direct Postgres pool to exhaust). |

## Automatic responses

- **Spend backstop**: `private.check_llm_spend(5.0)` runs every 30 minutes
  (pg_cron `llm-spend-backstop`). If today's estimated LLM cost passes $5 it
  flips `app_config.llm_disabled` to `true`: plans and reflections degrade to
  deterministic copy, estimate/label pause with a friendly 503. Turning it
  back on is deliberate: `update public.app_config set value='false' where
  key='llm_disabled';` after investigating. The per-user daily caps
  (`consume_quota`) remain the first line; this is the account-wide ceiling.
- **Retention pruning**: `private.prune_ops_tables()` runs nightly (pg_cron
  `prune-ops-tables`): terminal jobs after 7 days, push dedupe rows after 30
  days, search-cache rows a day past their longest TTL.

## Alerts (operator consoles, not code)

Same list as SECURITY.md's required operator actions: Anthropic hard spend
cap, Vercel usage alert, Supabase resource alerts. The in-app backstop above
limits damage between console alerts.

## Data growth and archival plan

Documented now, built when scale demands (spec item 8):

- `meal_logs` is the product's history and is never pruned. At real scale:
  monthly partitions by `date` (PARTITION BY RANGE), detach-and-archive
  partitions older than 24 months to cold storage. The `(user_id, date)`
  access pattern keeps partition pruning effective.
- `usage_events` is append-only telemetry. Keep 90 days hot once volume
  matters; roll older rows into a monthly aggregate table
  (`usage_events_monthly`: user_id, month, kind, calls, tokens, cost) and
  delete the raw rows. All current dashboards read the daily view, which the
  aggregate preserves.
- `jobs`, `push_sends`, `food_search_cache`: already bounded by the nightly
  prune.
- `plan_cache`: content-addressed and small (one row per distinct prompt per
  user); add it to the prune (30 days) if it ever shows up in table sizes.

## Load-test gate (increment 6, not yet run)

k6 script simulating N concurrent users generating plans + logging; the gate
is no P95 cliff and no connection exhaustion at the target user count.
