// Scheduled push sender: meal-time reminders from today's plans, the
// end-of-day reflection nudge, and the morning-after balance nudge.
// Invoked every 15 minutes by pg_cron (see MOBILE.md for the cron SQL);
// the only caller gate is the x-cron-secret header, since the function
// is deployed with verify_jwt = false.
//
// Dates and hours resolve per user from profiles.timezone (UTC fallback),
// matching the app's local day boundary.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  backoffMs,
  isTokenGone,
  isTransient,
  MAX_SEND_ATTEMPTS,
  pool,
  shouldReleaseClaim,
} from "./logic.ts";

// Config resolves from env vars when set, else from Supabase Vault via the
// service-role-only public.get_push_secret() rpc (PostgREST does not expose
// the vault schema directly). Vault names are the lowercased env names with
// a push_ prefix, e.g. APNS_TEAM_ID -> push_apns_team_id.
type Db = ReturnType<typeof createClient>;
const configCache = new Map<string, string>();

async function getConfig(db: Db, envName: string): Promise<string | undefined> {
  const fromEnv = Deno.env.get(envName);
  if (fromEnv) return fromEnv;
  if (configCache.has(envName)) return configCache.get(envName);
  const { data } = await db.rpc("get_push_secret", {
    secret_name: `push_${envName.toLowerCase()}`,
  });
  if (typeof data === "string" && data.length > 0) {
    configCache.set(envName, data);
    return data;
  }
  return undefined;
}

interface MealPlanEntry {
  meal_id: string;
  slot: string;
  time_hour?: number;
  why?: string;
}

// ---------- APNs provider JWT (ES256, cached; Apple wants reuse 20-60 min) ----------

let cachedJwt: { jwt: string; at: number } | null = null;

function base64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

interface ApnsConfig {
  teamId: string;
  keyId: string;
  p8: string;
  bundleId: string;
  host: string;
}

async function apnsJwt(cfg: ApnsConfig): Promise<string> {
  if (cachedJwt && Date.now() - cachedJwt.at < 45 * 60_000) return cachedJwt.jwt;

  // p8 is the key file content, base64-encoded to survive secret storage.
  const pem = atob(cfg.p8);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(pem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const header = base64url(JSON.stringify({ alg: "ES256", kid: cfg.keyId }));
  const payload = base64url(
    JSON.stringify({ iss: cfg.teamId, iat: Math.floor(Date.now() / 1000) }),
  );
  const signingInput = `${header}.${payload}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );

  cachedJwt = { jwt: `${signingInput}.${base64url(new Uint8Array(sig))}`, at: Date.now() };
  return cachedJwt.jwt;
}

async function sendApnsOnce(cfg: ApnsConfig, token: string, title: string, body: string): Promise<number> {
  try {
    const res = await fetch(`https://${cfg.host}/3/device/${token}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${await apnsJwt(cfg)}`,
        "apns-topic": cfg.bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
      },
      body: JSON.stringify({ aps: { alert: { title, body }, sound: "default" } }),
    });
    if (!res.ok) console.error(`APNs ${res.status} for token ${token.slice(0, 8)}...`, await res.text());
    return res.status;
  } catch (err) {
    // network failure: status 0, retried like a 5xx
    console.error(`APNs network error for token ${token.slice(0, 8)}...`, err);
    return 0;
  }
}

/** Final status after up to MAX_SEND_ATTEMPTS tries with backoff. */
async function sendApns(cfg: ApnsConfig, token: string, title: string, body: string): Promise<number> {
  let status = 0;
  for (let attempt = 0; attempt < MAX_SEND_ATTEMPTS; attempt++) {
    status = await sendApnsOnce(cfg, token, title, body);
    if (!isTransient(status)) return status;
    if (attempt < MAX_SEND_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, backoffMs(attempt)));
  }
  return status;
}

// ---------- main ----------

Deno.serve(async (req) => {
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const cronSecret = await getConfig(db, "CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");
  if (!cronSecret || !provided || provided !== cronSecret) {
    return new Response("forbidden", { status: 403 });
  }

  const [teamId, keyId, p8, bundleId, host] = await Promise.all([
    getConfig(db, "APNS_TEAM_ID"),
    getConfig(db, "APNS_KEY_ID"),
    getConfig(db, "APNS_P8"),
    getConfig(db, "BUNDLE_ID"),
    getConfig(db, "APNS_HOST"),
  ]);
  if (!teamId || !keyId || !p8 || !bundleId || !host) {
    return new Response(JSON.stringify({ error: "push config incomplete" }), { status: 500 });
  }
  const cfg: ApnsConfig = { teamId, keyId, p8, bundleId, host };

  const now = new Date();

  // Each user's "today" and clock follow their profile timezone (UTC when
  // unset or invalid), matching the app's day boundary.
  const localDateISO = (tz: string | null): string => {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: tz ?? "UTC",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);
    } catch {
      return now.toISOString().slice(0, 10);
    }
  };
  const hourIn = (tz: string | null, at: Date): number => {
    try {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: tz ?? "UTC",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(at);
      const h = Number(parts.find((p) => p.type === "hour")?.value);
      const m = Number(parts.find((p) => p.type === "minute")?.value);
      if (Number.isFinite(h) && Number.isFinite(m)) return (h % 24) + m / 60;
    } catch {
      // fall through
    }
    return at.getUTCHours() + at.getUTCMinutes() / 60;
  };
  const localHour = (tz: string | null): number => hourIn(tz, now);
  const addDaysISO = (date: string, n: number): string => {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  const [{ data: tokens }, { data: profiles }] = await Promise.all([
    db.from("device_tokens").select("user_id, token"),
    db.from("profiles").select("id, timezone"),
  ]);

  const tokensByUser = new Map<string, string[]>();
  for (const t of tokens ?? []) {
    tokensByUser.set(t.user_id, [...(tokensByUser.get(t.user_id) ?? []), t.token]);
  }
  const tzByUser = new Map((profiles ?? []).map((p) => [p.id, p.timezone as string | null]));
  // Per push-capable user: their local date and fractional hour right now.
  const clockByUser = new Map<string, { today: string; nowH: number }>();
  for (const [userId] of tokensByUser) {
    const tz = tzByUser.get(userId) ?? null;
    clockByUser.set(userId, { today: localDateISO(tz), nowH: localHour(tz) });
  }
  // Local calendars can span two dates at any moment; fetch the union.
  const dateSet = [...new Set([...clockByUser.values()].map((c) => c.today))];
  if (dateSet.length === 0) dateSet.push(localDateISO(null));
  // Each push-capable user's local yesterday, for the balance nudge.
  const yesterdayByUser = new Map<string, string>();
  for (const [userId, clock] of clockByUser) {
    yesterdayByUser.set(userId, addDaysISO(clock.today, -1));
  }
  const yesterdaySet = [...new Set([...yesterdayByUser.values()])];
  if (yesterdaySet.length === 0) yesterdaySet.push(addDaysISO(localDateISO(null), -1));

  const [{ data: plans }, { data: meals }, { data: answers }, { data: dailyLogs }, { data: mealLogs }, { data: balances }] =
    await Promise.all([
      db.from("meal_plans").select("user_id, meals, date").in("date", dateSet),
      db.from("meals").select("id, name"),
      db.from("onboarding_answers").select("user_id, eating_window_end, created_at").order("created_at", { ascending: false }),
      db.from("daily_logs").select("user_id, finished_at, date").in("date", dateSet),
      db.from("meal_logs").select("user_id, date").in("date", dateSet),
      db.from("day_adjustments").select("user_id, source_date, created_at").in("source_date", yesterdaySet),
    ]);

  const mealNameById = new Map((meals ?? []).map((m) => [m.id, m.name]));
  const windowEndByUser = new Map<string, number>();
  for (const a of answers ?? []) {
    if (!windowEndByUser.has(a.user_id)) windowEndByUser.set(a.user_id, a.eating_window_end);
  }
  // Only rows matching that user's own local date count.
  const finishedUsers = new Set(
    (dailyLogs ?? [])
      .filter((d) => d.finished_at && d.date === clockByUser.get(d.user_id)?.today)
      .map((d) => d.user_id),
  );
  const loggedUsers = new Set(
    (mealLogs ?? [])
      .filter((l) => l.date === clockByUser.get(l.user_id)?.today)
      .map((l) => l.user_id),
  );

  const startedAt = Date.now();
  let sent = 0;
  let failed = 0;
  let pruned = 0;
  let released = 0;

  /** Claim the dedup row first; an empty result means another tick already sent. */
  async function claim(userId: string, kind: string): Promise<boolean> {
    const date = clockByUser.get(userId)?.today ?? localDateISO(null);
    const { data } = await db
      .from("push_sends")
      .upsert({ user_id: userId, date, kind }, { onConflict: "user_id,date,kind", ignoreDuplicates: true })
      .select();
    return (data?.length ?? 0) > 0;
  }

  /** Undo a claim whose delivery failed transiently; the next tick retries. */
  async function releaseClaim(userId: string, kind: string) {
    const date = clockByUser.get(userId)?.today ?? localDateISO(null);
    await db.from("push_sends").delete().match({ user_id: userId, date, kind });
    released++;
  }

  // The three nudge passes below only COLLECT what is due; delivery happens
  // in one bounded-concurrency dispatch so a slow APNs or a big user base
  // cannot stretch the tick past its window.
  interface DueNotification {
    userId: string;
    kind: string;
    title: string;
    body: string;
  }
  const due: DueNotification[] = [];

  async function dispatch(n: DueNotification) {
    // Claim before sending: overlapping ticks must not double-notify. A
    // fully-transient failure releases the claim so the next tick retries.
    if (!(await claim(n.userId, n.kind))) return;
    const finalStatuses: number[] = [];
    for (const token of tokensByUser.get(n.userId) ?? []) {
      const status = await sendApns(cfg, token, n.title, n.body);
      finalStatuses.push(status);
      if (status === 200) sent++;
      else failed++;
      if (isTokenGone(status)) {
        await db.from("device_tokens").delete().eq("token", token);
        pruned++;
      }
    }
    if (shouldReleaseClaim(finalStatuses)) await releaseClaim(n.userId, n.kind);
  }

  // Meal reminders: slots 15-45 minutes out, on the user's own clock.
  for (const plan of plans ?? []) {
    const clock = clockByUser.get(plan.user_id);
    if (!clock || plan.date !== clock.today) continue;
    const entries = plan.meals as MealPlanEntry[];
    for (let i = 0; i < entries.length; i++) {
      const t = entries[i].time_hour;
      if (t === undefined || t < clock.nowH + 0.25 || t >= clock.nowH + 0.75) continue;
      const name = mealNameById.get(entries[i].meal_id) ?? "Your next meal";
      due.push({
        userId: plan.user_id,
        kind: `slot-${i}`,
        title: `${name} in about 30 min`,
        body: entries[i].why ?? "It's on today's plan.",
      });
    }
  }

  // Reflection nudge: an hour past the eating window (user-local), day not
  // finished, something logged.
  for (const [userId] of tokensByUser) {
    const windowEnd = windowEndByUser.get(userId);
    const nowH = clockByUser.get(userId)?.nowH ?? now.getUTCHours();
    if (windowEnd === undefined || nowH <= windowEnd + 1) continue;
    if (finishedUsers.has(userId) || !loggedUsers.has(userId)) continue;
    due.push({
      userId,
      kind: "reflect",
      title: "How did today go?",
      body: "Take 30 seconds to close out your day.",
    });
  }

  // Morning-after balance nudge: balancing a big night is the moment the
  // restrict impulse peaks the NEXT morning, so one push of permission goes
  // out 9-11am local while nothing is logged yet. Only balances applied in
  // the evening (17:00+ local, from the adjustment rows' created_at) count:
  // a balance applied before then means the user logged the night from
  // inside the app the morning after, where BalanceSheet shows the same
  // message inline. Recalculating or removing the balance rewrites or
  // deletes its rows, so the pending nudge follows automatically. Copy
  // never mentions amounts or yesterday's food; SAFETY.md screens framing.
  const balancedEveningUsers = new Set<string>();
  for (const row of balances ?? []) {
    if (row.source_date !== yesterdayByUser.get(row.user_id)) continue;
    const tz = tzByUser.get(row.user_id) ?? null;
    if (hourIn(tz, new Date(row.created_at)) >= 17) balancedEveningUsers.add(row.user_id);
  }
  for (const userId of balancedEveningUsers) {
    const nowH = clockByUser.get(userId)?.nowH ?? now.getUTCHours();
    if (nowH < 9 || nowH >= 11) continue;
    if (loggedUsers.has(userId)) continue;
    due.push({
      userId,
      kind: "balance-morning",
      title: "Today's a normal day",
      body: "Your week is already balanced. Regular meals and plenty of water; nothing to make up.",
    });
  }

  // Fan out with bounded concurrency: 8 users in flight, tokens sequential
  // within a user, per-token retry/backoff inside sendApns.
  await pool(due, 8, dispatch);

  const result = {
    ok: true,
    considered: due.length,
    sent,
    failed,
    pruned,
    released,
    tookMs: Date.now() - startedAt,
  };
  console.log("push tick:", JSON.stringify(result));
  return new Response(JSON.stringify(result), {
    headers: { "content-type": "application/json" },
  });
});
