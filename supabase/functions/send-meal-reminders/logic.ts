// Pure fan-out policy for the push sender. No Deno APIs on purpose: this
// file is bun-tested from the repo while index.ts (Deno) imports it.

/** APNs outcomes worth retrying: rate limit, server trouble, network (0). */
export const TRANSIENT_STATUSES = new Set([0, 429, 500, 503]);

export function isTransient(status: number): boolean {
  return TRANSIENT_STATUSES.has(status);
}

/** Token is dead; delete it. */
export function isTokenGone(status: number): boolean {
  return status === 410 || status === 400;
}

export const MAX_SEND_ATTEMPTS = 3;

// ---------- APNs host selection ----------

/**
 * Apple runs two push clouds, and a token only works on the one matching
 * the provisioning that minted it (Xcode dev builds = sandbox, TestFlight
 * and App Store = production). The host is therefore per-token policy,
 * not deployment config. Legacy rows without the column all came from
 * development builds, so anything but an explicit "production" resolves
 * to the sandbox.
 */
export const APNS_HOSTS = {
  development: "api.sandbox.push.apple.com",
  production: "api.push.apple.com",
} as const;

export function apnsHostFor(environment: string | null | undefined): string {
  return environment === "production" ? APNS_HOSTS.production : APNS_HOSTS.development;
}

/** 500ms, 1500ms between attempts; APNs recovers fast or not at all. */
export function backoffMs(attempt: number): number {
  return 500 * Math.pow(3, attempt);
}

/**
 * Whether a notification's dedupe claim should be released so the next
 * cron tick retries it: nothing was delivered anywhere, and at least one
 * token failed transiently (a retry could succeed). If any token got the
 * push, keep the claim; retrying would double-notify that device.
 */
export function shouldReleaseClaim(finalStatuses: number[]): boolean {
  if (finalStatuses.length === 0) return false;
  const delivered = finalStatuses.some((s) => s === 200);
  const anyTransient = finalStatuses.some((s) => isTransient(s));
  return !delivered && anyTransient;
}

// ---------- slot decisions ----------
// Each pass answers two questions the notification-event log needs kept
// apart: was the slot due at all (not due = log nothing, the moment just
// hasn't arrived), and if due, did it fire or get suppressed and why.
// Reasons are stable strings; analysis groups by them.

export type SlotDecision =
  | { due: false }
  | { due: true; fire: true }
  | { due: true; fire: false; reason: string };

/** Meal reminder window: the slot's time is 15-45 minutes out. */
export function mealReminderDue(timeHour: number | undefined, nowH: number): boolean {
  return timeHour !== undefined && timeHour >= nowH + 0.25 && timeHour < nowH + 0.75;
}

// ---------- evening close (Phase 4.1) ----------
// The conditional correction: silence on a good day is what makes the
// coach credible on a bad one. Fires only when a real, evidenced gap
// exists, in the window between the day's planned eating and quiet hours.

/**
 * When the close becomes due: two hours before quiet hours per the spec,
 * but never before the day's planned eating has had its chance (a gap
 * complained about before dinner is not a gap, it is impatience).
 */
export function eveningCloseHour(s: {
  quietStart: number | null;
  lastMealHour: number | null;
}): number {
  const quiet = s.quietStart ?? DEFAULT_QUIET_START;
  const base = quiet - 2;
  return s.lastMealHour !== null ? Math.max(base, s.lastMealHour + 0.5) : base;
}

/**
 * Within 10% of the plan's protein counts as on target, and a day with
 * nothing logged has an unknowable gap; both are logged silence. The due
 * window ends where quiet hours begin.
 */
export function eveningCloseDecision(s: {
  nowH: number;
  closeHour: number;
  quietStart: number | null;
  hasPlan: boolean;
  finished: boolean;
  loggedAnything: boolean;
  proteinLogged: number;
  proteinTarget: number;
}): SlotDecision {
  const quiet = s.quietStart ?? DEFAULT_QUIET_START;
  if (s.nowH < s.closeHour || s.nowH >= quiet) return { due: false };
  if (!s.hasPlan) return { due: true, fire: false, reason: "no-plan" };
  if (s.finished) return { due: true, fire: false, reason: "day-already-closed" };
  if (!s.loggedAnything) return { due: true, fire: false, reason: "nothing-logged" };
  if (s.proteinLogged >= 0.9 * s.proteinTarget) return { due: true, fire: false, reason: "on-target" };
  return { due: true, fire: true };
}

export interface SuggestionMeal {
  name: string;
  proteinG: number;
  prepMin: number;
  cookMin: number;
}

/**
 * A low-friction, no-cook option sized to the gap: nobody cooks at 8pm.
 * Prefer the smallest no-cook meal that covers the gap; otherwise the
 * biggest one available. Null when the catalog has no no-cook option.
 */
export function pickNoCookSuggestion(
  meals: SuggestionMeal[],
  gapProteinG: number,
): string | null {
  const noCook = meals.filter((m) => m.prepMin + m.cookMin <= 5 && m.proteinG > 0);
  if (noCook.length === 0) return null;
  const covering = noCook.filter((m) => m.proteinG >= gapProteinG);
  const pick =
    covering.length > 0
      ? covering.reduce((a, b) => (b.proteinG < a.proteinG ? b : a))
      : noCook.reduce((a, b) => (b.proteinG > a.proteinG ? b : a));
  return pick.name;
}

/** Spec template: "~{n}g of protein short. {suggestion} closes it." */
export function buildEveningClose(b: {
  proteinRemaining: number;
  suggestion: string | null;
}): { title: string; body: string } {
  return {
    title: `~${b.proteinRemaining}g of protein short`,
    body: `${b.suggestion ?? "A protein shake"} closes it.`,
  };
}

/**
 * Morning-after balance nudge: due 9-11am local for users who balanced a
 * big night the previous evening. Anything already logged means the user
 * is having a normal day on their own; silence on success.
 */
export function balanceMorningDecision(s: {
  nowH: number;
  balancedEvening: boolean;
  logged: boolean;
}): SlotDecision {
  if (!s.balancedEvening || s.nowH < 9 || s.nowH >= 11) return { due: false };
  if (s.logged) return { due: true, fire: false, reason: "already-logged-today" };
  return { due: true, fire: true };
}

// ---------- morning brief (Phase 2) ----------
// The pre-decision slot: converts an open-ended day into decisions already
// made. Fires once, in a bounded morning window, and only when there is a
// plan to brief.

/** "HH:MM" 24h to fractional hours; null when missing or malformed. */
export function parseTimeToHour(time: string | null | undefined): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const h = Number(m[1]) + Number(m[2]) / 60;
  return h >= 0 && h < 24 ? h : null;
}

/** Sender-side twin of the app's formatTimeHour: 12-hour default clock. */
export function formatHourLabel(timeHour: number, prefers24h?: boolean | null): string {
  let h = Math.floor(timeHour);
  let m = Math.round((timeHour % 1) * 60);
  if (m === 60) {
    h += 1;
    m = 0;
  }
  h %= 24;
  const mm = String(m).padStart(2, "0");
  if (prefers24h) return `${h}:${mm}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${h >= 12 ? "pm" : "am"}`;
}

/**
 * When the brief aims to land: 30 minutes before the eating window opens
 * (this build's wake-time proxy), pulled earlier on training days with an
 * early session so prep is possible, and never inside quiet hours: a brief
 * that would land there waits for quiet end instead.
 */
export function morningBriefHour(s: {
  windowStart: number;
  trainHour: number | null;
  quietStart: number | null;
  quietEnd: number | null;
}): number {
  let hour = s.windowStart - 0.5;
  if (s.trainHour !== null) hour = Math.min(hour, s.trainHour - 1);
  hour = Math.max(0, hour);
  if (inQuietHours(hour, s.quietStart, s.quietEnd)) {
    hour = s.quietEnd ?? DEFAULT_QUIET_END;
  }
  return hour;
}

/**
 * Due for two hours from the brief hour; after that the morning is gone and
 * a "morning" brief would read as noise. A day without a plan has nothing
 * to brief; that silence is logged.
 */
export function morningBriefDecision(s: {
  nowH: number;
  briefHour: number;
  hasPlan: boolean;
}): SlotDecision {
  if (s.nowH < s.briefHour || s.nowH >= s.briefHour + 2) return { due: false };
  if (!s.hasPlan) return { due: true, fire: false, reason: "no-plan" };
  return { due: true, fire: true };
}

export interface MorningBriefInput {
  /** formatted local training time; null on rest days drops the clause */
  trainLabel: string | null;
  proteinG: number;
  kcal: number;
  anchorName: string;
  anchorPrepMin: number;
}

/** The spec template, two lines, no em-dashes (app-wide copy rule). */
export function buildMorningBrief(b: MorningBriefInput): { title: string; body: string } {
  const targets = `${b.proteinG}g protein, ${b.kcal} cal`;
  return {
    title: b.trainLabel ? `Lifting at ${b.trainLabel}. ${targets}.` : `Today: ${targets}.`,
    body: `${b.anchorName} is the big one: ${b.anchorPrepMin} min. Everything else is easy.`,
  };
}

/** APNs category per kind: the brief carries its own action set. */
export function categoryFor(kind: string): string {
  return kind === "morning-brief" ? "DEMI_BRIEF" : "DEMI_SLOT";
}

// ---------- prep anchor (Phase 3.1) ----------
// Timed to the action that enables the meal, not the meal itself: an hour
// before the anchor meal, 90 minutes when it has to thaw first. It stays
// useful until 15 minutes out; an already-logged anchor is silence on
// success, with the reason recorded.

export function prepAnchorDecision(s: {
  nowH: number;
  anchorHour: number | undefined;
  requiresThaw: boolean;
  anchorLogged: boolean;
}): SlotDecision {
  if (s.anchorHour === undefined) return { due: false };
  const lead = s.requiresThaw ? 1.5 : 1;
  if (s.nowH < s.anchorHour - lead || s.nowH >= s.anchorHour - 0.25) return { due: false };
  if (s.anchorLogged) return { due: true, fire: false, reason: "anchor-already-logged" };
  return { due: true, fire: true };
}

/** Spec template with the em-dash replaced; the deficit line only when real. */
export function buildPrepAnchor(b: {
  requiresThaw: boolean;
  mealName: string;
  prepMin: number;
  proteinRemaining: number;
}): { title: string; body: string } {
  const title = b.requiresThaw
    ? `Start thawing: ${b.mealName}`
    : `Start soon: ${b.mealName} (${b.prepMin} min)`;
  const body =
    b.proteinRemaining > 0
      ? `You're ${b.proteinRemaining}g of protein behind. This meal closes it.`
      : "Tonight's anchor meal. You're already on track.";
  return { title, body };
}

// ---------- standing preferences (Phase 1) ----------
// Applied after a slot decides to fire, ordered by how permanent the choice
// is: a killed slot stays dead, then the intensity level, then the nightly
// quiet window. Every non-send is a logged suppression.

/**
 * Notification family a concrete send kind belongs to. The prep anchor is
 * the evolved meal reminder, so one kill (and the intensity table) covers
 * both: slot-N and prep-anchor -> meal-reminder.
 */
export function kindFamily(kind: string): string {
  if (kind.startsWith("slot-") || kind === "prep-anchor") return "meal-reminder";
  return kind;
}

/** Spec default quiet hours: 21:30 to 07:00 local. */
export const DEFAULT_QUIET_START = 21.5;
export const DEFAULT_QUIET_END = 7;

/**
 * Families each intensity allows; null allows everything (coach). Unknown
 * values fail open to coach so a bad write can never silence a user's
 * pushes wholesale.
 */
const INTENSITY_FAMILIES: Record<string, Set<string> | null> = {
  coach: null,
  // checkin = morning brief + evening close per the intensity table
  checkin: new Set(["morning-brief", "balance-morning", "evening-close"]),
  // quiet = morning brief only, PLUS balance-morning: that nudge is a rare,
  // evidence-triggered correction against restriction spirals, and muting
  // it under "quiet" would harm exactly the users it exists to protect.
  quiet: new Set(["morning-brief", "balance-morning"]),
};

/** True when the local hour falls inside the quiet range (overnight wraps). */
export function inQuietHours(
  nowH: number,
  start: number | null,
  end: number | null,
): boolean {
  const s = start ?? DEFAULT_QUIET_START;
  const e = end ?? DEFAULT_QUIET_END;
  if (s === e) return false;
  return s < e ? nowH >= s && nowH < e : nowH >= s || nowH < e;
}

export interface PreferenceState {
  /** profiles.notification_intensity; null means the coach default */
  intensity: string | null;
  quietStart: number | null;
  quietEnd: number | null;
  killedFamilies: Set<string>;
}

export function preferenceFilter(
  kind: string,
  nowH: number,
  prefs: PreferenceState,
): { send: true } | { send: false; reason: string } {
  const family = kindFamily(kind);
  if (prefs.killedFamilies.has(family)) return { send: false, reason: "slot-killed" };
  const intensity = prefs.intensity ?? "coach";
  const allowed = INTENSITY_FAMILIES[intensity] ?? null;
  if (allowed && !allowed.has(family)) {
    return { send: false, reason: `intensity-${intensity}` };
  }
  if (inQuietHours(nowH, prefs.quietStart, prefs.quietEnd)) {
    return { send: false, reason: "quiet-hours" };
  }
  return { send: true };
}

// ---------- ignore-decay (Phase 4.2) ----------
// The user votes with their thumbs: three consecutive ignored fires pause
// a family for seven days; it returns once, and one more ignore turns it
// off permanently (a decay-sourced kill row). No re-ask, no "we noticed"
// prompt. Derived from the event log, so there is no extra state to drift.

export interface FiredOutcome {
  /** user-local date the notification fired */
  date: string;
  /** past-day pending or explicit ignored = true; opened/action = false */
  ignored: boolean;
}

export type DecayState =
  | { mode: "active" }
  | { mode: "paused"; until: string }
  | { mode: "probation" }
  | { mode: "killed" };

function addDays(dateISO: string, n: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Walk a family's fired history (oldest to newest; today's still-live
 * events excluded by the caller). Trailing consecutive ignores decide:
 * under 3 = active; the 3rd starts a 7-day pause; the first fire after
 * the pause is the probation shot, and an ignored probation kills.
 */
export function ignoreDecay(fired: FiredOutcome[], today: string): DecayState {
  let trailing = 0;
  for (let i = fired.length - 1; i >= 0; i--) {
    if (fired[i].ignored) trailing++;
    else break;
  }
  if (trailing < 3) return { mode: "active" };
  // The pause is earned by the streak's 3rd ignore and runs 7 days from
  // its date. Fires inside that window can only predate decay shipping;
  // they are legacy ignores, not probation shots. Only an ignored fire
  // from AFTER the window is a spent probation, and that kills.
  const third = fired[fired.length - trailing + 2];
  const until = addDays(third.date, 7);
  const probationSpent = fired
    .slice(fired.length - trailing + 3)
    .some((f) => f.date >= until);
  if (probationSpent) return { mode: "killed" };
  if (today < until) return { mode: "paused", until };
  return { mode: "probation" };
}

/** Run tasks with bounded concurrency; rejections never kill the pool. */
export async function pool<T>(
  items: T[],
  size: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.max(1, Math.min(size, queue.length)) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item === undefined) break;
      try {
        await run(item);
      } catch {
        // a single user's failure must never stop the rest of the fan-out
      }
    }
  });
  await Promise.all(workers);
}
