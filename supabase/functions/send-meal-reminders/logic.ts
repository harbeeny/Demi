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

/**
 * Evening reflection: due an hour past the eating window. Fires only when
 * the day is still open and something was logged; both suppressions are the
 * system staying quiet on purpose, so they are logged with reasons.
 */
export function reflectDecision(s: {
  nowH: number;
  windowEnd: number | undefined;
  finished: boolean;
  logged: boolean;
}): SlotDecision {
  if (s.windowEnd === undefined || s.nowH <= s.windowEnd + 1) return { due: false };
  if (s.finished) return { due: true, fire: false, reason: "day-already-closed" };
  if (!s.logged) return { due: true, fire: false, reason: "nothing-logged" };
  return { due: true, fire: true };
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

// ---------- standing preferences (Phase 1) ----------
// Applied after a slot decides to fire, ordered by how permanent the choice
// is: a killed slot stays dead, then the intensity level, then the nightly
// quiet window. Every non-send is a logged suppression.

/** Notification family a concrete send kind belongs to (slot-2 -> meal-reminder). */
export function kindFamily(kind: string): string {
  return kind.startsWith("slot-") ? "meal-reminder" : kind;
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
  checkin: new Set(["balance-morning", "reflect"]),
  quiet: new Set(["balance-morning"]),
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
