// k6 load check (Phase 6, increment 6): N concurrent users generating
// plans and logging food against a deployed environment.
//
//   k6 run scripts/load/plan-and-log.js \
//     -e BASE_URL=https://demi-gold.vercel.app \
//     -e SUPABASE_URL=https://<ref>.supabase.co \
//     -e SUPABASE_KEY=<publishable key> \
//     -e TARGET_VUS=25
//
// setup() mints TARGET_VUS anonymous users and onboards them with a
// 'k6-load-test' marker in dislikes; OBSERVABILITY.md carries the one-line
// cleanup SQL that cascades them away afterwards. Every VU then loops the
// real hot path: build/confirm today's plan (queued: enqueue + poll), log
// three estimate entries, one food search, one health check.
//
// The gate (thresholds below): <2% request failures, no P95 cliff on the
// interactive endpoints, and queued plan builds completing inside 20s.

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter } from "k6/metrics";

const BASE = __ENV.BASE_URL || "https://demi-gold.vercel.app";
const SUPABASE_URL = __ENV.SUPABASE_URL;
const SUPABASE_KEY = __ENV.SUPABASE_KEY;
const TARGET_VUS = Number(__ENV.TARGET_VUS || 25);

const planCompleteMs = new Trend("plan_complete_ms", true);
const planFailures = new Counter("plan_failures");

export const options = {
  setupTimeout: "180s",
  scenarios: {
    daily_use: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: TARGET_VUS },
        { duration: "2m", target: TARGET_VUS },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    "http_req_duration{op:log}": ["p(95)<2500"],
    "http_req_duration{op:search}": ["p(95)<3000"],
    "http_req_duration{op:poll}": ["p(95)<2500"],
    "http_req_duration{op:health}": ["p(95)<1500"],
    plan_complete_ms: ["p(95)<20000"],
  },
};

export function setup() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_KEY are required (publishable key only).");
  }
  const sessions = [];
  for (let i = 0; i < TARGET_VUS; i++) {
    // Anonymous sign-in, same call supabase-js makes.
    const signup = http.post(
      `${SUPABASE_URL}/auth/v1/signup`,
      JSON.stringify({ data: { source: "k6-load-test" }, gotrue_meta_security: {} }),
      { headers: { apikey: SUPABASE_KEY, "content-type": "application/json" } },
    );
    if (signup.status === 429) {
      // Supabase throttles anonymous sign-ups (~30/hour/IP): a real abuse
      // guard, and at high TARGET_VUS the test simply runs with the users
      // it managed to mint.
      console.warn(`anon signup rate limited after ${sessions.length} users; running with those.`);
      break;
    }
    if (signup.status !== 200) {
      throw new Error(`anon signup ${i} failed: ${signup.status} ${signup.body}`);
    }
    const body = JSON.parse(signup.body);
    const token = body.access_token;
    const userId = body.user && body.user.id;

    // Onboard directly through PostgREST with the user's own JWT (RLS
    // allows own-row insert; identical trust path to the real app).
    // dislikes carries the cleanup marker.
    const onboard = http.post(
      `${SUPABASE_URL}/rest/v1/onboarding_answers`,
      JSON.stringify({
        user_id: userId,
        sex: "male",
        age: 30,
        height_cm: 180,
        weight_kg: 80,
        goal: "maintain",
        activity_level: "light",
        dislikes: ["k6-load-test"],
      }),
      {
        headers: {
          apikey: SUPABASE_KEY,
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          prefer: "return=minimal",
        },
      },
    );
    if (onboard.status !== 201) {
      throw new Error(`onboarding ${i} failed: ${onboard.status} ${onboard.body}`);
    }
    sessions.push({ token });
  }
  if (sessions.length < 5) {
    throw new Error(`only ${sessions.length} test users minted; too few for a meaningful run.`);
  }
  return { sessions };
}

const SEARCHES = ["chicken breast", "greek yogurt", "banana", "brown rice"];

export default function (data) {
  const session = data.sessions[(__VU - 1) % data.sessions.length];
  const auth = {
    authorization: `Bearer ${session.token}`,
    "content-type": "application/json",
  };

  // 1. Build (first iteration) or confirm (idempotent 200) today's plan.
  const plan = http.post(`${BASE}/api/plan`, "{}", {
    headers: auth,
    tags: { op: "plan" },
  });
  check(plan, { "plan accepted": (r) => r.status === 200 || r.status === 202 });

  if (plan.status === 202) {
    const jobId = JSON.parse(plan.body).jobId;
    const started = Date.now();
    let done = false;
    for (let i = 0; i < 30; i++) {
      sleep(1);
      const poll = http.get(`${BASE}/api/plan/job?id=${jobId}`, {
        headers: auth,
        tags: { op: "poll" },
      });
      if (poll.status !== 200) continue;
      const status = JSON.parse(poll.body).status;
      if (status === "done") {
        done = true;
        break;
      }
      if (status === "failed") break;
    }
    planCompleteMs.add(Date.now() - started);
    if (!done) planFailures.add(1);
  }

  // 2. Log three quick estimate entries (auth + RLS + rollup path), up to
  //    a realistic daily volume: real users don't log 300 items a day, and
  //    the API's day ceiling correctly 400s garbage totals.
  const logsSoFar = __ITER * 3;
  for (let i = 0; logsSoFar < 18 && i < 3; i++) {
    const log = http.post(
      `${BASE}/api/log`,
      JSON.stringify({
        source: "estimate",
        name: `k6 test snack ${i}`,
        kcal: 400,
        proteinG: 20,
        carbsG: 45,
        fatG: 15,
      }),
      { headers: auth, tags: { op: "log" } },
    );
    check(log, { "log saved": (r) => r.status === 200 });
  }

  // 3. One food search from a small pool: first hits fill the caches, the
  //    rest exercise them (never hammers the shared USDA key).
  const q = SEARCHES[__ITER % SEARCHES.length];
  const search = http.get(`${BASE}/api/food/search?q=${encodeURIComponent(q)}`, {
    headers: auth,
    tags: { op: "search" },
  });
  check(search, { "search ok": (r) => r.status === 200 });

  // 4. Health, as an uptime monitor would.
  const health = http.get(`${BASE}/api/health`, { tags: { op: "health" } });
  check(health, { "health ok": (r) => r.status === 200 });

  sleep(1);
}
