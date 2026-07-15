// Scheduled push sender: meal-time reminders from today's plans plus the
// end-of-day reflection nudge. Invoked every 15 minutes by pg_cron (see
// MOBILE.md for the cron SQL); the only caller gate is the x-cron-secret
// header, since the function is deployed with verify_jwt = false.
//
// Dates and hours resolve per user from profiles.timezone (UTC fallback),
// matching the app's local day boundary.

import { createClient } from "npm:@supabase/supabase-js@2";

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

async function sendApns(cfg: ApnsConfig, token: string, title: string, body: string): Promise<number> {
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
  if (!res.ok) console.error(`APNs ${res.status} for token ${token.slice(0, 8)}…`, await res.text());
  return res.status;
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
  const localHour = (tz: string | null): number => {
    try {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: tz ?? "UTC",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(now);
      const h = Number(parts.find((p) => p.type === "hour")?.value);
      const m = Number(parts.find((p) => p.type === "minute")?.value);
      if (Number.isFinite(h) && Number.isFinite(m)) return (h % 24) + m / 60;
    } catch {
      // fall through
    }
    return now.getUTCHours() + now.getUTCMinutes() / 60;
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

  const [{ data: plans }, { data: meals }, { data: answers }, { data: dailyLogs }, { data: mealLogs }] =
    await Promise.all([
      db.from("meal_plans").select("user_id, meals, date").in("date", dateSet),
      db.from("meals").select("id, name"),
      db.from("onboarding_answers").select("user_id, eating_window_end, created_at").order("created_at", { ascending: false }),
      db.from("daily_logs").select("user_id, finished_at, date").in("date", dateSet),
      db.from("meal_logs").select("user_id, date").in("date", dateSet),
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

  let sent = 0;
  let pruned = 0;

  /** Claim the dedup row first; an empty result means another tick already sent. */
  async function claim(userId: string, kind: string): Promise<boolean> {
    const date = clockByUser.get(userId)?.today ?? localDateISO(null);
    const { data } = await db
      .from("push_sends")
      .upsert({ user_id: userId, date, kind }, { onConflict: "user_id,date,kind", ignoreDuplicates: true })
      .select();
    return (data?.length ?? 0) > 0;
  }

  async function deliver(userId: string, title: string, body: string) {
    for (const token of tokensByUser.get(userId) ?? []) {
      const status = await sendApns(cfg, token, title, body);
      if (status === 200) sent++;
      if (status === 410 || status === 400) {
        await db.from("device_tokens").delete().eq("token", token);
        pruned++;
      }
    }
  }

  // Meal reminders: slots 15-45 minutes out, on the user's own clock.
  for (const plan of plans ?? []) {
    const clock = clockByUser.get(plan.user_id);
    if (!clock || plan.date !== clock.today) continue;
    const entries = plan.meals as MealPlanEntry[];
    for (let i = 0; i < entries.length; i++) {
      const t = entries[i].time_hour;
      if (t === undefined || t < clock.nowH + 0.25 || t >= clock.nowH + 0.75) continue;
      if (!(await claim(plan.user_id, `slot-${i}`))) continue;
      const name = mealNameById.get(entries[i].meal_id) ?? "Your next meal";
      await deliver(plan.user_id, `${name} in about 30 min`, entries[i].why ?? "It's on today's plan.");
    }
  }

  // Reflection nudge: an hour past the eating window (user-local), day not
  // finished, something logged.
  for (const [userId] of tokensByUser) {
    const windowEnd = windowEndByUser.get(userId);
    const nowH = clockByUser.get(userId)?.nowH ?? now.getUTCHours();
    if (windowEnd === undefined || nowH <= windowEnd + 1) continue;
    if (finishedUsers.has(userId) || !loggedUsers.has(userId)) continue;
    if (!(await claim(userId, "reflect"))) continue;
    await deliver(userId, "How did today go?", "Take 30 seconds to close out your day.");
  }

  return new Response(JSON.stringify({ ok: true, sent, pruned }), {
    headers: { "content-type": "application/json" },
  });
});
