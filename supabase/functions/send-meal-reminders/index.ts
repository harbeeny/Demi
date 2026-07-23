// Scheduled push sender: the morning brief, the prep anchor, meal-time
// reminders from today's plans, the end-of-day reflection nudge, and the
// morning-after balance nudge. Invoked every 15 minutes by pg_cron (see
// MOBILE.md for the cron SQL); the only caller gate is the x-cron-secret
// header, since the function is deployed with verify_jwt = false.
//
// Dates and hours resolve per user from profiles.timezone (UTC fallback),
// matching the app's local day boundary.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  apnsHostFor,
  backoffMs,
  balanceMorningDecision,
  buildMorningBrief,
  categoryFor,
  formatHourLabel,
  isTokenGone,
  isTransient,
  MAX_SEND_ATTEMPTS,
  mealReminderDue,
  morningBriefDecision,
  morningBriefHour,
  parseTimeToHour,
  pool,
  prepAnchorDecision,
  buildPrepAnchor,
  preferenceFilter,
  type PreferenceState,
  reflectDecision,
  shouldReleaseClaim,
} from "./logic.ts";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

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

/** Custom payload keys the app's tap handler reads back. */
interface PushMeta {
  kind: string;
  date: string;
}

async function sendApnsOnce(
  cfg: ApnsConfig,
  host: string,
  token: string,
  title: string,
  body: string,
  meta: PushMeta,
  category: string,
): Promise<number> {
  try {
    const res = await fetch(`https://${host}/3/device/${token}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${await apnsJwt(cfg)}`,
        "apns-topic": cfg.bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
      },
      // The category picks the long-press action set the app registered
      // natively: DEMI_BRIEF for the morning brief, DEMI_SLOT otherwise.
      body: JSON.stringify({
        aps: { alert: { title, body }, sound: "default", category },
        demi: meta,
      }),
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
async function sendApns(
  cfg: ApnsConfig,
  host: string,
  token: string,
  title: string,
  body: string,
  meta: PushMeta,
  category: string,
): Promise<number> {
  let status = 0;
  for (let attempt = 0; attempt < MAX_SEND_ATTEMPTS; attempt++) {
    status = await sendApnsOnce(cfg, host, token, title, body, meta, category);
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

  // The APNs host is no longer config: it is derived per token from the
  // environment column (dev builds sandbox, TestFlight/App Store prod).
  // The old push_apns_host vault secret is simply unread.
  const [teamId, keyId, p8, bundleId] = await Promise.all([
    getConfig(db, "APNS_TEAM_ID"),
    getConfig(db, "APNS_KEY_ID"),
    getConfig(db, "APNS_P8"),
    getConfig(db, "BUNDLE_ID"),
  ]);
  if (!teamId || !keyId || !p8 || !bundleId) {
    return new Response(JSON.stringify({ error: "push config incomplete" }), { status: 500 });
  }
  const cfg: ApnsConfig = { teamId, keyId, p8, bundleId };

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

  const [{ data: tokens }, { data: profiles }, { data: kills }] = await Promise.all([
    db.from("device_tokens").select("user_id, token, environment"),
    db
      .from("profiles")
      .select(
        "id, timezone, prefers_24h_time, notification_intensity, quiet_hours_start, quiet_hours_end",
      ),
    db.from("notification_kills").select("user_id, family"),
  ]);

  const tokensByUser = new Map<string, Array<{ token: string; environment: string | null }>>();
  for (const t of tokens ?? []) {
    tokensByUser.set(t.user_id, [
      ...(tokensByUser.get(t.user_id) ?? []),
      { token: t.token as string, environment: (t.environment as string | null) ?? null },
    ]);
  }
  const tzByUser = new Map((profiles ?? []).map((p) => [p.id, p.timezone as string | null]));
  const prefers24hByUser = new Map(
    (profiles ?? []).map((p) => [p.id, (p.prefers_24h_time as boolean | null) ?? null]),
  );
  // Standing notification preferences per user (Phase 1): intensity, quiet
  // hours, and permanently killed families.
  const killedByUser = new Map<string, Set<string>>();
  for (const k of kills ?? []) {
    if (!killedByUser.has(k.user_id)) killedByUser.set(k.user_id, new Set());
    killedByUser.get(k.user_id)!.add(k.family as string);
  }
  const prefsByUser = new Map<string, PreferenceState>(
    (profiles ?? []).map((p) => [
      p.id,
      {
        intensity: (p.notification_intensity as string | null) ?? null,
        quietStart: (p.quiet_hours_start as number | null) ?? null,
        quietEnd: (p.quiet_hours_end as number | null) ?? null,
        killedFamilies: killedByUser.get(p.id) ?? new Set<string>(),
      },
    ]),
  );
  const defaultPrefs: PreferenceState = {
    intensity: null,
    quietStart: null,
    quietEnd: null,
    killedFamilies: new Set(),
  };
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
      db.from("meals").select("id, name, protein_g, kcal, prep_min, cook_min, requires_thaw"),
      db
        .from("onboarding_answers")
        .select(
          "user_id, eating_window_start, eating_window_end, training_days, training_time, created_at",
        )
        .order("created_at", { ascending: false }),
      db.from("daily_logs").select("user_id, finished_at, date").in("date", dateSet),
      db.from("meal_logs").select("user_id, date, plan_slot_index, protein_g").in("date", dateSet),
      db.from("day_adjustments").select("user_id, source_date, created_at").in("source_date", yesterdaySet),
    ]);

  const mealNameById = new Map((meals ?? []).map((m) => [m.id, m.name]));
  const mealById = new Map((meals ?? []).map((m) => [m.id, m]));
  // Latest onboarding row per user (the query is newest-first).
  interface OnboardingInfo {
    windowStart: number;
    windowEnd: number;
    trainingDays: string[];
    trainingTime: string | null;
  }
  const onboardingByUser = new Map<string, OnboardingInfo>();
  for (const a of answers ?? []) {
    if (!onboardingByUser.has(a.user_id)) {
      onboardingByUser.set(a.user_id, {
        windowStart: a.eating_window_start as number,
        windowEnd: a.eating_window_end as number,
        trainingDays: (a.training_days as string[] | null) ?? [],
        trainingTime: (a.training_time as string | null) ?? null,
      });
    }
  }
  const windowEndByUser = new Map<string, number>();
  for (const [userId, ob] of onboardingByUser) windowEndByUser.set(userId, ob.windowEnd);
  // Today's plan entries per user, on each user's own calendar.
  const planByUserToday = new Map<string, MealPlanEntry[]>();
  for (const plan of plans ?? []) {
    if (plan.date === clockByUser.get(plan.user_id)?.today) {
      planByUserToday.set(plan.user_id, plan.meals as MealPlanEntry[]);
    }
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
  // Today's logged protein and logged plan slots per user, for the prep
  // anchor's deficit line and its silence-on-success suppression.
  const loggedProteinByUser = new Map<string, number>();
  const loggedSlotsByUser = new Map<string, Set<number>>();
  for (const l of mealLogs ?? []) {
    if (l.date !== clockByUser.get(l.user_id)?.today) continue;
    loggedProteinByUser.set(
      l.user_id,
      (loggedProteinByUser.get(l.user_id) ?? 0) + (Number(l.protein_g) || 0),
    );
    if (l.plan_slot_index !== null && l.plan_slot_index !== undefined) {
      if (!loggedSlotsByUser.has(l.user_id)) loggedSlotsByUser.set(l.user_id, new Set());
      loggedSlotsByUser.get(l.user_id)!.add(Number(l.plan_slot_index));
    }
  }

  // The day's anchor per user: the highest-protein planned meal, with the
  // plan's own totals riding along for the brief and the prep anchor.
  interface AnchorInfo {
    index: number;
    name: string;
    prepMin: number;
    requiresThaw: boolean;
    timeHour: number | undefined;
    planProtein: number;
    planKcal: number;
  }
  const anchorByUser = new Map<string, AnchorInfo>();
  for (const [userId, entries] of planByUserToday) {
    let planProtein = 0;
    let planKcal = 0;
    let best: AnchorInfo | null = null;
    let bestProtein = -1;
    for (let i = 0; i < entries.length; i++) {
      const m = mealById.get(entries[i].meal_id);
      if (!m) continue;
      const protein = Number(m.protein_g) || 0;
      planProtein += protein;
      planKcal += Number(m.kcal) || 0;
      if (protein > bestProtein) {
        bestProtein = protein;
        best = {
          index: i,
          name: m.name as string,
          prepMin: (Number(m.prep_min) || 0) + (Number(m.cook_min) || 0),
          requiresThaw: Boolean(m.requires_thaw),
          timeHour: entries[i].time_hour,
          planProtein: 0,
          planKcal: 0,
        };
      }
    }
    if (best) {
      best.planProtein = planProtein;
      best.planKcal = planKcal;
      anchorByUser.set(userId, best);
    }
  }

  const startedAt = Date.now();
  let sent = 0;
  let failed = 0;
  let pruned = 0;
  let released = 0;
  let suppressed = 0;

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

  /**
   * Append to the notification decision log. True when a row was written;
   * a duplicate (23505) means an earlier tick already recorded this exact
   * decision, which re-evaluation every 15 minutes makes routine.
   */
  async function recordEvent(row: {
    user_id: string;
    date: string;
    kind: string;
    fired_at?: string;
    outcome?: string;
    suppression_reason?: string;
  }): Promise<boolean> {
    const { error } = await db.from("notification_events").insert(row);
    if (!error) return true;
    if (error.code !== "23505") {
      console.error("notification_events insert failed:", error.message);
    }
    return false;
  }

  /** A slot was due but a rule kept it quiet; log why, once per reason. */
  async function recordSuppressed(userId: string, kind: string, reason: string) {
    const date = clockByUser.get(userId)?.today ?? localDateISO(null);
    if (await recordEvent({ user_id: userId, date, kind, outcome: "suppressed", suppression_reason: reason })) {
      suppressed++;
    }
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

  /**
   * A slot decided to fire; the user's standing preferences get the last
   * word. Kills, intensity, and quiet hours all land in the decision log
   * as suppressions, so silence is always accounted for.
   */
  async function enqueue(n: DueNotification) {
    const prefs = prefsByUser.get(n.userId) ?? defaultPrefs;
    const nowH = clockByUser.get(n.userId)?.nowH ?? now.getUTCHours();
    const verdict = preferenceFilter(n.kind, nowH, prefs);
    if (!verdict.send) {
      await recordSuppressed(n.userId, n.kind, verdict.reason);
      return;
    }
    due.push(n);
  }

  async function dispatch(n: DueNotification) {
    // Claim before sending: overlapping ticks must not double-notify. A
    // fully-transient failure releases the claim so the next tick retries.
    if (!(await claim(n.userId, n.kind))) return;
    const date = clockByUser.get(n.userId)?.today ?? localDateISO(null);
    const category = categoryFor(n.kind);
    const finalStatuses: number[] = [];
    for (const t of tokensByUser.get(n.userId) ?? []) {
      const status = await sendApns(
        cfg,
        apnsHostFor(t.environment),
        t.token,
        n.title,
        n.body,
        { kind: n.kind, date },
        category,
      );
      finalStatuses.push(status);
      if (status === 200) sent++;
      else failed++;
      if (isTokenGone(status)) {
        await db.from("device_tokens").delete().eq("token", t.token);
        pruned++;
      }
    }
    if (shouldReleaseClaim(finalStatuses)) {
      await releaseClaim(n.userId, n.kind);
      return;
    }
    // Delivered somewhere: the decision log gets its fired row. The app
    // flips outcome to opened/action_taken from the device on interaction.
    if (finalStatuses.some((s) => s === 200)) {
      await recordEvent({ user_id: n.userId, date, kind: n.kind, fired_at: new Date().toISOString() });
    }
  }

  // Morning brief: the day's pre-decision. 30 minutes before the eating
  // window opens (this build's wake proxy), pulled earlier on early-training
  // days, deferred past quiet hours, once per day inside a 2-hour window.
  for (const [userId] of tokensByUser) {
    const ob = onboardingByUser.get(userId);
    const clock = clockByUser.get(userId);
    if (!ob || !clock || typeof ob.windowStart !== "number") continue;
    const prefs = prefsByUser.get(userId) ?? defaultPrefs;
    const weekday = WEEKDAYS[new Date(`${clock.today}T12:00:00Z`).getUTCDay()];
    const training = ob.trainingDays.map((d) => d.toLowerCase()).includes(weekday);
    const trainHour = training ? parseTimeToHour(ob.trainingTime) : null;
    const briefHour = morningBriefHour({
      windowStart: ob.windowStart,
      trainHour,
      quietStart: prefs.quietStart,
      quietEnd: prefs.quietEnd,
    });
    const entries = planByUserToday.get(userId) ?? [];
    const decision = morningBriefDecision({
      nowH: clock.nowH,
      briefHour,
      hasPlan: entries.length > 0,
    });
    if (!decision.due) continue;
    if (!decision.fire) {
      await recordSuppressed(userId, "morning-brief", decision.reason);
      continue;
    }
    // Targets come from the plan itself (what today actually delivers);
    // the anchor is the highest-protein meal, its minutes are prep + cook.
    const anchor = anchorByUser.get(userId);
    if (!anchor) {
      await recordSuppressed(userId, "morning-brief", "no-plan");
      continue;
    }
    const brief = buildMorningBrief({
      trainLabel:
        trainHour !== null ? formatHourLabel(trainHour, prefers24hByUser.get(userId) ?? null) : null,
      proteinG: Math.round(anchor.planProtein),
      kcal: Math.round(anchor.planKcal),
      anchorName: anchor.name,
      anchorPrepMin: Math.round(anchor.prepMin),
    });
    await enqueue({ userId, kind: "morning-brief", title: brief.title, body: brief.body });
  }

  // Prep anchor: timed to the action that enables the meal. An hour before
  // the anchor meal (90 minutes when it thaws), suppressed once the anchor
  // is logged. It supersedes the anchor's plain slot reminder below.
  for (const [userId, anchor] of anchorByUser) {
    const clock = clockByUser.get(userId);
    if (!clock) continue;
    const decision = prepAnchorDecision({
      nowH: clock.nowH,
      anchorHour: anchor.timeHour,
      requiresThaw: anchor.requiresThaw,
      anchorLogged: loggedSlotsByUser.get(userId)?.has(anchor.index) ?? false,
    });
    if (!decision.due) continue;
    if (!decision.fire) {
      await recordSuppressed(userId, "prep-anchor", decision.reason);
      continue;
    }
    const proteinRemaining = Math.max(
      0,
      Math.round(anchor.planProtein - (loggedProteinByUser.get(userId) ?? 0)),
    );
    const prep = buildPrepAnchor({
      requiresThaw: anchor.requiresThaw,
      mealName: anchor.name,
      prepMin: Math.round(anchor.prepMin),
      proteinRemaining,
    });
    await enqueue({ userId, kind: "prep-anchor", title: prep.title, body: prep.body });
  }

  // Meal reminders: slots 15-45 minutes out, on the user's own clock.
  for (const plan of plans ?? []) {
    const clock = clockByUser.get(plan.user_id);
    if (!clock || plan.date !== clock.today) continue;
    const entries = plan.meals as MealPlanEntry[];
    for (let i = 0; i < entries.length; i++) {
      // The anchor meal's reminder is the prep anchor above, not this one.
      if (i === anchorByUser.get(plan.user_id)?.index) continue;
      if (!mealReminderDue(entries[i].time_hour, clock.nowH)) continue;
      const name = mealNameById.get(entries[i].meal_id) ?? "Your next meal";
      await enqueue({
        userId: plan.user_id,
        kind: `slot-${i}`,
        title: `${name} in about 30 min`,
        body: entries[i].why ?? "It's on today's plan.",
      });
    }
  }

  // Reflection nudge: an hour past the eating window (user-local), day not
  // finished, something logged. Suppressions land in the decision log.
  for (const [userId] of tokensByUser) {
    const decision = reflectDecision({
      nowH: clockByUser.get(userId)?.nowH ?? now.getUTCHours(),
      windowEnd: windowEndByUser.get(userId),
      finished: finishedUsers.has(userId),
      logged: loggedUsers.has(userId),
    });
    if (!decision.due) continue;
    if (!decision.fire) {
      await recordSuppressed(userId, "reflect", decision.reason);
      continue;
    }
    await enqueue({
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
    const decision = balanceMorningDecision({
      nowH: clockByUser.get(userId)?.nowH ?? now.getUTCHours(),
      balancedEvening: true,
      logged: loggedUsers.has(userId),
    });
    if (!decision.due) continue;
    if (!decision.fire) {
      await recordSuppressed(userId, "balance-morning", decision.reason);
      continue;
    }
    await enqueue({
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
    suppressed,
    tookMs: Date.now() - startedAt,
  };
  console.log("push tick:", JSON.stringify(result));
  return new Response(JSON.stringify(result), {
    headers: { "content-type": "application/json" },
  });
});
