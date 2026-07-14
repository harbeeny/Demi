// Scheduled push sender: meal-time reminders from today's plans plus the
// end-of-day reflection nudge. Invoked every 15 minutes by pg_cron (see
// MOBILE.md for the cron SQL); the only caller gate is the x-cron-secret
// header, since the function is deployed with verify_jwt = false.
//
// Times are UTC, matching the app's todayISO() convention (known debt).

import { createClient } from "npm:@supabase/supabase-js@2";

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

async function apnsJwt(): Promise<string> {
  if (cachedJwt && Date.now() - cachedJwt.at < 45 * 60_000) return cachedJwt.jwt;

  // APNS_P8 is the .p8 file content, base64-encoded to survive secret storage.
  const pem = atob(Deno.env.get("APNS_P8")!);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(pem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const header = base64url(JSON.stringify({ alg: "ES256", kid: Deno.env.get("APNS_KEY_ID") }));
  const payload = base64url(
    JSON.stringify({ iss: Deno.env.get("APNS_TEAM_ID"), iat: Math.floor(Date.now() / 1000) }),
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

async function sendApns(token: string, title: string, body: string): Promise<number> {
  const res = await fetch(`https://${Deno.env.get("APNS_HOST")}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${await apnsJwt()}`,
      "apns-topic": Deno.env.get("BUNDLE_ID")!,
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
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const nowH = now.getUTCHours() + now.getUTCMinutes() / 60;

  const [{ data: tokens }, { data: plans }, { data: meals }, { data: answers }, { data: dailyLogs }, { data: mealLogs }] =
    await Promise.all([
      db.from("device_tokens").select("user_id, token"),
      db.from("meal_plans").select("user_id, meals").eq("date", today),
      db.from("meals").select("id, name"),
      db.from("onboarding_answers").select("user_id, eating_window_end, created_at").order("created_at", { ascending: false }),
      db.from("daily_logs").select("user_id, finished_at").eq("date", today),
      db.from("meal_logs").select("user_id").eq("date", today),
    ]);

  const tokensByUser = new Map<string, string[]>();
  for (const t of tokens ?? []) {
    tokensByUser.set(t.user_id, [...(tokensByUser.get(t.user_id) ?? []), t.token]);
  }
  const mealNameById = new Map((meals ?? []).map((m) => [m.id, m.name]));
  const windowEndByUser = new Map<string, number>();
  for (const a of answers ?? []) {
    if (!windowEndByUser.has(a.user_id)) windowEndByUser.set(a.user_id, a.eating_window_end);
  }
  const finishedUsers = new Set((dailyLogs ?? []).filter((d) => d.finished_at).map((d) => d.user_id));
  const loggedUsers = new Set((mealLogs ?? []).map((l) => l.user_id));

  let sent = 0;
  let pruned = 0;

  /** Claim the dedup row first; an empty result means another tick already sent. */
  async function claim(userId: string, kind: string): Promise<boolean> {
    const { data } = await db
      .from("push_sends")
      .upsert({ user_id: userId, date: today, kind }, { onConflict: "user_id,date,kind", ignoreDuplicates: true })
      .select();
    return (data?.length ?? 0) > 0;
  }

  async function deliver(userId: string, title: string, body: string) {
    for (const token of tokensByUser.get(userId) ?? []) {
      const status = await sendApns(token, title, body);
      if (status === 200) sent++;
      if (status === 410 || status === 400) {
        await db.from("device_tokens").delete().eq("token", token);
        pruned++;
      }
    }
  }

  // Meal reminders: slots 15-45 minutes out.
  for (const plan of plans ?? []) {
    if (!tokensByUser.has(plan.user_id)) continue;
    const entries = plan.meals as MealPlanEntry[];
    for (let i = 0; i < entries.length; i++) {
      const t = entries[i].time_hour;
      if (t === undefined || t < nowH + 0.25 || t >= nowH + 0.75) continue;
      if (!(await claim(plan.user_id, `slot-${i}`))) continue;
      const name = mealNameById.get(entries[i].meal_id) ?? "Your next meal";
      await deliver(plan.user_id, `${name} in about 30 min`, entries[i].why ?? "It's on today's plan.");
    }
  }

  // Reflection nudge: an hour past the eating window, day not finished, something logged.
  for (const [userId] of tokensByUser) {
    const windowEnd = windowEndByUser.get(userId);
    if (windowEnd === undefined || nowH <= windowEnd + 1) continue;
    if (finishedUsers.has(userId) || !loggedUsers.has(userId)) continue;
    if (!(await claim(userId, "reflect"))) continue;
    await deliver(userId, "How did today go?", "Take 30 seconds to close out your day.");
  }

  return new Response(JSON.stringify({ ok: true, sent, pruned }), {
    headers: { "content-type": "application/json" },
  });
});
