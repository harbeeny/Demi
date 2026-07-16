# Security Baseline

Demi handles health and dietary data, which is sensitive personal data under GDPR and CCPA. This baseline is non-negotiable and is enforced by an audit gate: every PR from this point runs `/vibe-security` (the vibe-security skill in `.claude/skills/vibe-security/`) and confirmed findings are fixed before merge. The skill auto-activates whenever a change touches auth, database access, API keys, secrets, or user data.

Stack: Next.js 15 (App Router) on Vercel, Supabase (Postgres + Auth), Capacitor iOS shell loading a static export.

## 1. Database access control (Supabase RLS)

- RLS is enabled on every table in `public`. A migration that adds a table MUST enable RLS in the same migration.
- Every user-data table is scoped to the row owner: `USING (auth.uid() = user_id)` (or `= id` for `profiles`). Never `USING (true)` or `USING (auth.uid() IS NOT NULL)` on user data.
- Every write path (INSERT and UPDATE) carries a `WITH CHECK (auth.uid() = user_id)` so a row can never be created or re-assigned to another user. INSERT-only WITH CHECK is not sufficient; UPDATE needs it too.
- `meals` is a shared read-only catalog: SELECT for `authenticated`, no write policies.
- `push_sends` is service-role-only: RLS enabled, zero policies, so users can neither read nor write it. This is intentional deny-all, not a missing policy.
- Secret access goes through `public.get_push_secret()` (SECURITY DEFINER). EXECUTE is revoked from `anon` and `authenticated`; only the service role (used by the edge function) may call it. Any new SECURITY DEFINER function follows the same rule: revoke EXECUTE from `anon`/`authenticated` unless it is deliberately public and safe.
- Guest accounts use Supabase anonymous sign-in, so `authenticated` includes anonymous users. Owner-scoped policies still isolate each guest; the Supabase "anonymous access policy" advisories are expected and accepted for this design.
- Verification: a signed-in user must read zero rows of another user's `profiles`, `meal_logs`, `meal_plans`, `weight_logs`, `daily_logs`, `device_tokens`, or `day_adjustments`. This is checked with a role-simulated cross-user probe (see the audit runbook below) and must stay at zero.

## 2. No secrets client-side

- Server-only secrets (`ANTHROPIC_API_KEY`, `FDC_API_KEY`, `CRON_SECRET`, the Supabase `service_role` key, the APNs `.p8`) live only in server code: API route handlers and the Supabase edge function. They are never referenced from client components or from any module a client component imports.
- Only the Supabase URL and anon key are exposed as `NEXT_PUBLIC_`. Those are safe to be public precisely because RLS gates all access. No other value gets a `NEXT_PUBLIC_`/`EXPO_PUBLIC_` prefix.
- `.env*`, `*.p8`, and `*.pem` are gitignored and untracked. The APNs key is never committed.
- The Capacitor static export (`out/`) must not embed any server-only env value. Because server keys are only read inside API routes and the edge function (never in client-imported code), the export cannot bundle them.

## 3. Server-side auth on every protected endpoint

- Every handler under `src/app/api/**/route.ts` calls `loadContext(request)` (`src/lib/plan/context.ts`) before touching data. Middleware is not the only line of defense.
- The JWT is verified against the Supabase Auth server via `supabase.auth.getUser()` (cookie path) or `getUser(jwt)` (Bearer path). Tokens are never trust-decoded locally.
- Request handlers use the caller's user-scoped Supabase client so RLS applies. The service-role client is confined to the edge function; it is never used in a user-facing request handler.
- The push edge function runs with `verify_jwt=false` and gates on a constant `x-cron-secret`, failing closed when the secret is absent or wrong.

## 4. Abuse and rate limiting

- Guest sign-in is one tap (`signInAnonymously`) and unlimited accounts can be minted, so every paid/expensive endpoint carries a per-user daily cap. The counter lives in `private.usage_counters` (a schema PostgREST does not expose) and is incremented atomically through the SECURITY DEFINER `public.consume_quota(bucket, limit)` rpc, keyed on `auth.uid()` so a user can neither bill another account nor reset their own counter. Caps live in `src/lib/plan/quota.ts` (`llm` 40/day, `fdc` 150/day).
- LLM-backed routes (`/api/plan` generate, `/api/plan/week`, `/api/log/estimate`, `/api/day/finish`, and `/api/chat` when a model is connected) call `consumeQuota(supabase, "llm")` and return 429 before any Anthropic call. `/api/plan` additionally short-circuits to the stored plan when today's already exists and `regenerate` is not set, so it never bills a duplicate generation. `/api/food/search` calls `consumeQuota(supabase, "fdc")` on a cache miss only (cache hits stay free) to protect the shared USDA key.
- Every `chat()` call sets an explicit `maxTokens` (512 or 1024). LLM output numbers are validated with `numbersAreGrounded`; quick-add/FDC macros are bounded by `validateEstimate`.
- These per-account caps are the primary defense; a hard provider-side spend ceiling is the backstop (see Required operator actions).

## 5. Sensitive-data posture (GDPR / CCPA)

- Encryption at rest is provided by Supabase (AES-256); all transport is TLS.
- Data export exists (`/api/export`) and a delete path is provided so a user can remove their account and data on request.
- Free-text notes are screened for disordered-eating signals (`safety-filter.ts`) and dropped rather than stored when flagged.

## 6. Deployment configuration

- Security response headers are set for the web deployment: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (frame-ancestors), `Referrer-Policy`, and a `Permissions-Policy` that denies unused features. `X-Powered-By` is disabled.
- No production source maps (`productionBrowserSourceMaps` stays false/unset).
- No debug endpoints; server error responses return generic messages, never stack traces or internal detail. Secrets, tokens, and PII are never logged.

## Audit runbook

1. Run `/vibe-security` for the static code audit (secrets, RLS SQL, endpoint auth, rate limiting, AI/injection, mobile, deployment).
2. Run the live cross-user RLS probe against the Supabase project (role-simulated `authenticated` with a test `sub`, counting other users' rows across every user table; every count must be zero).
3. Run the Supabase security advisors (`get_advisors type=security`) and reconcile each item as fixed or documented-accepted here.
4. Fix confirmed findings; record any accepted risk in this file with its rationale.

## Required operator actions

Some defenses live outside the codebase and must be set in provider consoles:

- **Anthropic console:** set a hard monthly spend cap and a billing alert. The per-user daily caps bound each account, but a spend ceiling is the backstop against mass account creation.
- **Vercel:** set a spend/usage alert on the project.
- **Supabase Auth:** enable leaked-password protection (HaveIBeenPwned) for email/password sign-ins (flagged by the security advisor).
- Consider a captcha (Turnstile/hCaptcha) on the guest "Skip sign-in" button before broad launch, to throttle anonymous account minting.

## Accepted risks (documented)

- **Session token in WKWebView localStorage (iOS).** The Capacitor shell stores the Supabase session in `localStorage` inside the app's WKWebView. On iOS the webview storage lives in the app's sandbox container, unreadable by other apps; the residual risk is an in-webview XSS, which is mitigated by React's default escaping (no `dangerouslySetInnerHTML` in the app) and the CSP-adjacent headers above. Revisit with Keychain-backed storage if the threat model changes.
- **Supabase "anonymous access policy" advisories.** Expected: guest mode uses anonymous sign-in, so owner-scoped policies necessarily apply to the `authenticated` role. Isolation is still per-user.
- **Cron-secret comparison in the push edge function.** The `x-cron-secret` gate uses a plain `!==`, not a constant-time compare. The secret is high-entropy and random, so there is no practical network timing oracle; the audit panel refuted an exploit here. Left as-is; revisit if the gate ever protects something lower-entropy.
