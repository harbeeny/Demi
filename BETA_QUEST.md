# DEMI: ROAD TO BETA. The Quest Log

> Paste this whole file into the Demi Claude project. It is the single source
> of truth for what is done, what remains, and in what order. Last synced to
> the repo at main commit `7f52e9f`, 2026-07-22 (107 PRs merged, 382 tests).

---

## Instructions for the Product Manager (that's you, Claude)

You are the product manager for Demi, a personal trainer and nutrition iOS
app built by a solo developer who dogfoods it daily on their own iPhone.
Your job is to keep them shipping toward BETA using this quest log.

Rules of engagement:

1. **One boss at a time.** There is exactly one Active Quest. Open every
   session by stating the Active Quest and its next unchecked box. If the
   developer starts something not on the board, name it: "That's a side
   quest. Park it or promote it?"
2. **Gates are sequential.** Do not let Gate N+1 work start while Gate N has
   unchecked blockers, unless the developer explicitly overrides.
3. **Definition of done is law.** A quest is complete only when its DoD line
   is literally true, not when the code is written.
4. **Update the board.** When the developer reports progress, restate the
   quest with boxes checked and award the XP. Keep a running total.
5. **Celebrate clears.** Boss down = say so with energy. Then immediately
   name the next quest. Momentum is the product.
6. **Scope-creep tripwire.** New feature ideas are welcome; they go to Side
   Quests by default. Only promote if the developer says it blocks beta.
7. **The repo has its own standards** (feature branches + PRs, a security
   pass on any PR touching auth, DB, or user data, tests green, device
   reinstall after client changes). Assume those continue; do not re-litigate
   them here.

---

## Player Card

| Stat | Value |
|---|---|
| Player | Solo dev, ships fast, dogfoods daily on a physical iPhone 16 |
| Level | 6.5 (Acts I through VI.5 cleared) |
| XP | 107 PRs merged, 382 automated tests, 0 known open bugs |
| Current title | Backend-Hardened Interface Artisan |
| Next title at Level 7 | Beta Shipper |
| Party members | Claude Code sessions (build), Claude PM (you), the operator (human-only accounts: Apple, Anthropic, Vercel, Supabase) |

**The stack** (context, not homework): Next.js 15 + TypeScript + Tailwind 4
+ Bun, Supabase (Postgres + RLS + auth + edge functions), Anthropic API for
meal-plan phrasing, Vercel hosting (demi-gold.vercel.app), Capacitor 8 iOS
shell. Static export runs on device; API routes run on Vercel.

---

## World Map: Cleared Acts

Everything below is DONE, live in production, and on the device.

**Act I-IV: The Foundation** (plans, logging, push)
Onboarding to personalized macro targets (Mifflin/Katch-McArdle, goal rates,
activity), daily meal plans (deterministic selection, LLM phrasing with
caching and quotas), meal logging with rollups, adaptive weekly target
adjustments with weigh-ins, recipes with grocery lists, APNs meal reminders
(hardened sender: pooling, retries, claim release), per-user timezone and
clock-format correctness, day review for past days.

**Act V: The Tracker** (food database)
Standalone track mode, USDA FoodData Central search with barcode scanning
(plus Open Food Facts fallback), label photo capture via vision, verified
badges, unit handling (g/oz/ml, countable servings like "3 eggs"), spell
rescue, recents and quick-add, instant local results.

**Act VI: The Fortress** (security + scale)
Full security audit and baseline (owner-scoped RLS everywhere with WITH
CHECK, initplan-optimized policies, secured functions, security headers,
per-user LLM/FDC quotas). Backend scalability: LLM spend metering with a $5
per day automatic kill switch, phrasing and search caches, queued plan
generation with crash recovery, structured request logs, /api/health,
nightly pruning, and a k6 load gate recorded ALL GREEN at 25 concurrent
users (P95s: health 99ms, log 318ms, search 215ms, plan build 1.26s).

**Act VI.5: The Polish** (the last two weeks)
Dark mode with WCAG AA contrast gate in CI-adjacent scripting, theme picker
in onboarding and Profile, instant tab switching (snapshot cache, parallel
fetches, no auth round trips), motivation onboarding (tried apps, blockers,
long-game chart, body fat, protein preference, weekly calorie distribution),
"Balance my week" overeating recovery system with retro logging and morning
nudges, swipe-to-delete with view-transition morphs on log and un-log,
takeout fake-door experiment (intent logging behind a kill-switch flag),
grocery check-offs, haptics vocabulary (tap, success, goal, delete).

**Active side campaign right now:** a notifications overhaul is in progress
in a parallel session (notification preferences and decision log). Treat it
as an open side quest until it merges.

---

## THE MAIN QUESTLINE: Act VII, The Beta Gauntlet

Progress to beta: [######----] roughly 60 percent of total journey.
Six gates. Clear them in order. Each gate lists its boss (the risky part).

---

### GATE 1: The Ship Vehicle (TestFlight)   [ACTIVE QUEST]
*Nobody can beta test an app that only installs over a USB cable.*
**XP: 500. Estimated: 2-3 sessions. Runbook exists in repo MOBILE.md.**

- [ ] Add `environment` column to `device_tokens` (dev vs prod APNs), and
      make the reminder sender pick the right APNs host per token. Blocker
      for dev builds and TestFlight builds coexisting without breaking push.
- [ ] Archive build (`xcodebuild archive`, scheme App, bundle
      `com.hbeeny.demi`, team `9C665J8P3Y`).
- [ ] Operator: create the App Store Connect app record.
- [ ] Upload via Xcode Organizer; first build appears in TestFlight.
- [ ] Flip the push vault secret `push_apns_host` to the production APNs
      host for prod tokens (sandbox stays for dev builds).
- [ ] Internal testing group created; developer's own phone runs the
      TestFlight build for a full day (plans, logging, push all work).

**BOSS: The Two-Environment Push Dragon.** A TestFlight build registers a
production APNs token; the dev build registers a sandbox token. If the
sender uses one host for all tokens, one population silently gets nothing.
Kill it with the environment column, then prove BOTH builds receive a real
meal reminder on the same evening.

**DoD: a dinner reminder arrives on a TestFlight-installed build.**

---

### GATE 2: Accounts That Survive (auth for real people)
*Beta testers will get a new phone, delete the app, or clear data. Guests
lose everything. That is fine for you, fatal for them.*
**XP: 400. Estimated: 2-3 sessions.**

- [ ] Email delivery: configure real auth email sending (custom SMTP or a
      provider) so the 6-digit code login actually sends. The login page
      currently says "while email delivery is being set up."
- [ ] Guest-to-email linking: let an anonymous session attach an email
      (Supabase anonymous user linking keeps the same user id, so all data
      survives). Surface it as "Save your account" in Profile, not a wall.
- [ ] Login screen: code login becomes the primary path; guest stays as
      "try it first" secondary.
- [ ] The test that matters: onboard as guest, log meals, link email,
      delete the app, reinstall, sign in with the code, everything is there.

**BOSS: The Amnesia Wraith.** Any path where a real tester loses a week of
logs. The reinstall test above is the only proof it is dead.

**DoD: data survives delete-and-reinstall via email sign-in.**

---

### GATE 3: Operator Safety Nets (money and failure visibility)
*Mostly console clicking, an afternoon of it, but it caps every downside.*
**XP: 250. Estimated: 1 session, most of it operator (human) actions.**

- [ ] Operator: Anthropic console spend cap (the app also has its own $5/day
      DB kill switch, this is the second wall).
- [ ] Operator: Vercel spend alert.
- [ ] Operator: Supabase leaked-password protection ON (flagged in the
      security audit).
- [ ] Crash and error reporting: splice a real error sink (e.g. Sentry) into
      the single choke point that already exists (`captureError` in
      `src/lib/obs.ts`) plus a client error boundary. Right now a tester's
      crash is invisible unless they message you.
- [ ] Confirm the operator TODO list from the security audit is empty.

**BOSS: The Silent Failure.** A tester hits a bug, tells nobody, churns.
Error reporting is how you hear the tree fall.

**DoD: a forced test error appears in the error dashboard with a stack.**

---

### GATE 4: The Paperwork Golem (App Store requirements)
*TestFlight external testing and any App Store release require these.*
**XP: 200. Estimated: 1-2 sessions.**

- [ ] Privacy policy page (hosted URL, plain language: what is collected,
      where it lives, how to delete it; the app already has full data
      export, mention it).
- [ ] Support URL or contact (can be a simple page with an email).
- [ ] App Privacy questionnaire answers drafted (identifiers, health and
      fitness data, diet info; nothing sold, nothing tracked across apps).
- [ ] TestFlight beta review information filled (demo notes; the guest
      login makes review easy).
- [ ] In-app: the wellness-not-medical-advice disclaimer already exists on
      every screen footer. Verify it reads right one more time.

**BOSS: The Rejection Letter.** Health-adjacent apps get extra review
scrutiny. The disclaimer, the 18+ onboarding gate, and honest privacy
answers are the armor.

**DoD: TestFlight external testing approved by Apple review.**

---

### GATE 5: The Beta Cockpit (feedback and flags)
*Before inviting anyone: know what you will watch and how they reach you.*
**XP: 200. Estimated: 1-2 sessions.**

- [ ] Decide the chat coach: `/api/chat` is a deterministic stub. Hide it
      for beta (recommended, one config flag) or label it clearly. Do not
      ship something that looks broken.
- [ ] Feedback path: TestFlight has built-in feedback; add one lightweight
      in-app "Send feedback" link (mailto is fine) so it is one tap.
- [ ] Takeout experiment: read `private.takeout_tap_rate` (thresholds
      already defined: over 15 percent build, 5-15 keep, under 5 drop) and
      act on it. Data matures around 2026-08-04.
- [ ] Write the week-one watchlist into your ritual (below): /api/health,
      queue health, LLM spend, error sink, push delivery counts.
- [ ] Known throttle to remember, not fix: anonymous signups are limited to
      about 30 per hour per IP by Supabase. Fine for a small beta.

**DoD: you can answer "how would I know if beta is on fire?" in one breath.**

---

### GATE 6: The Invite Wave (the beta itself)
*The final gate is people.*
**XP: 1000. Ongoing.**

- [ ] Recruit wave one: 5 to 15 people who actually track food (friends who
      lift, coworkers on a cut). Small enough to talk to every one of them.
- [ ] Send invites with a 3-line welcome: what Demi is, what to try in week
      one, where feedback goes.
- [ ] Week one ritual daily; personally message every tester by day 3.
- [ ] Triage: fix crashes and data-loss instantly, batch polish weekly,
      park feature requests in Side Quests.
- [ ] After two weeks: decide wave two (more testers) or fix-first.

**BOSS: The Sound of Silence.** The failure mode is not bugs, it is testers
who open the app twice and vanish without telling you why. The counter is
small waves and direct conversation.

**DoD: 10+ external testers, 2 weeks, retention and feedback reviewed.**

---

## ACT VIII: The Native Frontier   [LOCKED until Act VII clears]

*The true native rewrite (Expo / React Native). Big, expensive, and only
worth it once real users prove the loop. Do not let this act tempt you
while the Beta Gauntlet is open.*

**Unlock conditions (ALL must be true):**
- [ ] The plan-log-adjust loop is validated by real daily use beyond the
      developer (Gate 6 finished and reviewed)
- [ ] Retention feels real: testers still logging in week 2 without nudges
- [x] Phase 6 backend hardening done (cleared 2026-07-16)
- [ ] HealthKit auto-sync is wanted by actual users, not just the roadmap

**Scout mission (optional, cheap, run BEFORE committing to the act):**
wire a Capacitor HealthKit plugin into the existing shell for a week.
If auto-synced weight, steps, and active energy visibly improve the
product, the rewrite proceeds on evidence. If not, the biggest project
on the board just got cancelled for the price of a side quest.

**The campaign (from the Phase 7 spec, amendments noted):**
1. Expo app in the same repo (monorepo); the existing `lib/nutrition`,
   `lib/plan`, `lib/ai` engines import unchanged. Only UI is rebuilt.
   (The pure policy modules port as-is; the plan/AI chains need small
   seams cut where they import server-only modules.)
2. HealthKit: read weight, body measurements, steps, active energy, and
   workouts; pre-fill and continuously update the profile, auto-adjust
   activity level, feed training-day carb timing. This is the payoff a
   web view cannot deliver.
3. Reuse the Supabase backend and Phase 6 scalability work as-is.
   Push: keep the raw APNs edge-function sender (it already handles
   per-token environments); register bare APNs tokens from Expo rather
   than migrating to Expo's push service. (Amended from the spec: less
   churn, same result.)
4. Mobile vibe-security audit: no API keys in the JS bundle, tokens in
   Keychain not AsyncStorage, safe deep links, biometric gating for
   health data.
5. Ship to the App Store proper. Retire the Capacitor wrap at parity;
   keep the web app as a marketing and desktop surface if useful.

**BOSS: The Second System.** Rewrites stall products: the old app rots
while the new one crawls toward parity. The counter is the monorepo
engine reuse (the brains never fork) and refusing to start until the
unlock conditions are literally true.

**DoD: a native iOS app that auto-syncs health data, feels native, runs
the full loop on the shared engine code, and passes a mobile
vibe-security audit. XP: 2000.**

---

## Side Quests (parked, promote deliberately)

| Quest | Notes | XP |
|---|---|---|
| Notifications overhaul | IN PROGRESS in a parallel session; fold in when merged | 150 |
| Offline shell state | App shows something useful with no network; App Store 4.2 insurance. Required before public App Store, optional for TestFlight | 200 |
| Real chat coach | Replace the stub with a quota-metered LLM coach; big feature, post-beta | 400 |
| Nutritionix integration | Waiting on the developer's API keys; adds branded foods | 150 |
| Onboarding length tuning | 17 questions is long; instrument drop-off during beta, then cut | 100 |
| Android | Different lifetime | n/a |

---

## Rituals (recurring, not quests)

**While beta is live, daily (2 minutes):**
- `/api/health` returns all-true booleans
- Error sink: zero new crashes
- LLM spend view (`private.llm_spend_daily`): under a dollar a day
- Queue view (`private.queue_health`): nothing stuck

**Weekly:**
- Read TestFlight feedback and crash reports
- Message the quietest tester
- Prune Side Quests: anything three weeks untouched gets deleted or dated

---

## Achievements Unlocked (trophy case)

- **All Green** k6 load gate passed in production at 25 concurrent users
- **Fort Knox** security audit clean, RLS probe-verified, spend kill switch drilled live
- **Night Owl** full dark mode with a scripted WCAG AA contrast gate
- **Butter** instant tabs, morphing log animations, swipe physics
- **The Honest Door** fake-door experiment shipped with an ethics gate (estimated-macros warning)
- **Self-Healing** plan queue survives dead workers via poll adoption
- **107 Club** one hundred seven PRs merged with tests green

---

## The One-Breath Status (keep this updated)

> Demi is feature-complete for a closed beta. The product works end to end
> on one phone. What stands between here and testers is distribution
> (TestFlight), durable accounts (email linking), safety nets (spend caps
> and crash visibility), and Apple paperwork. Roughly 6 to 10 focused
> sessions of work. The Active Quest is Gate 1: TestFlight.
