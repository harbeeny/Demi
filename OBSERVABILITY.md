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

## Load-test gate (increment 6)

`scripts/load/plan-and-log.js` simulates N concurrent users doing a real
session against a deployed environment: anonymous sign-up + onboarding in
setup, then per iteration a plan build/confirm (queued: enqueue + poll),
three food logs, a food search, and a health check.

Run (the Supabase key is the **publishable** one, never anything else):

    k6 run scripts/load/plan-and-log.js \
      -e BASE_URL=https://demi-gold.vercel.app \
      -e SUPABASE_URL=https://<ref>.supabase.co \
      -e SUPABASE_KEY=<publishable key> \
      -e TARGET_VUS=25

The gate, encoded as k6 thresholds so the run itself passes or fails:
request failure rate <2%; P95 latency: logs <2.5s, search <3s, job polls
<2.5s, health <1.5s; queued plan builds complete (enqueue to done) in <20s
at P95.

Test users carry a `k6-load-test` marker in `onboarding_answers.dislikes`.
Cleanup after every run (cascades wipe their plans, logs, jobs, usage):

    delete from auth.users where id in (
      select user_id from public.onboarding_answers
      where 'k6-load-test' = any(dislikes));

Cost note: each fresh test user bills one personalize call on its first
plan build (~$0.002 at haiku rates; 25 users ≈ $0.05/run) and appears in
`private.llm_spend_daily` under `plan`. The spend backstop's $5 ceiling is
three orders of magnitude away.

### Recorded result, 2026-07-16, production, 25 VUs

3m34s, 11,829 requests, 55 req/s sustained, 1,959 iterations. No latency
cliff and no connection exhaustion anywhere:

| Threshold | Gate | Measured |
|---|---|---|
| health P95 | <1500ms | 99ms |
| log P95 | <2500ms | 318ms |
| job poll P95 | <2500ms | 265ms |
| search P95 | <3000ms | 215ms |
| plan build enqueue-to-done P95 | <20s | 1.26s |
| request failures | <2% | 4.73% (see below) |

**What broke, exactly as the gate intends:** the failure rate was entirely
one latent defect. Test users logging ~1,200 kcal every 2 seconds pushed
their `daily_logs` totals past the numeric column precision
(`total_kcal numeric(7,2)`, macros `numeric(6,2)`); every later log that
day 500'd with "numeric field overflow" after its `meal_logs` row had
already inserted. 555 of the 560 failures were this; excluding it, the
failure rate was 0.04%. Fixed in the same PR: `/api/log` now rejects any
log that would push the day past `DAY_KCAL_CEILING` (30,000 kcal, chosen
so no macro column can mathematically overflow) with a friendly 400
*before* inserting, so the log and its rollup can never disagree.

**Second finding:** Supabase throttles anonymous sign-ups (~30/hour/IP,
429 `over_request_rate_limit`). Good news operationally: this is the
guest-minting abuse throttle SECURITY.md's captcha note asked about. For
testing it means back-to-back full-size runs need an hour between them
(or a raised auth rate limit in the dashboard for the test window);
setup() now degrades gracefully and runs with the users it minted.

Verdict: latency and queue gates PASS with 8-10x headroom at 25
concurrent users; the failure-rate gate flagged one real defect, now
fixed and unit-tested. Re-run the one-line command above after merge for
a clean all-green record.
