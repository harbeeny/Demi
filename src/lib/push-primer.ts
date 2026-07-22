// Deferred push-permission state (Phase 1 of the notification system).
// Permission is a per-device fact, so this lives in localStorage, not the
// profile: the user sees 1-2 in-app briefs first, the ask happens from day
// 2, a "Not yet" backs off for 7 days, and there are never more than two
// asks total. The pure helpers keep the policy bun-testable.

import type { PushPermission } from "@/lib/push";

const KEY = "demi:pushPrimer";

export interface PrimerState {
  /** distinct local dates the user saw Today with a plan (a "brief") */
  briefDays: string[];
  /** how many times the pre-permission screen has been shown, ever */
  askCount: number;
  /** local date of the last ask, for the 7-day back-off */
  lastAskAt: string | null;
}

export const EMPTY_PRIMER: PrimerState = { briefDays: [], askCount: 0, lastAskAt: null };

/** Record that today's brief was seen (pure; capped, deduped). */
export function withBriefDay(state: PrimerState, today: string): PrimerState {
  if (state.briefDays.includes(today)) return state;
  return { ...state, briefDays: [...state.briefDays, today].slice(-8) };
}

/** Record that the pre-permission screen was shown today (pure). */
export function withAsk(state: PrimerState, today: string): PrimerState {
  return { ...state, askCount: state.askCount + 1, lastAskAt: today };
}

function daysBetween(fromISO: string, toISO: string): number {
  const from = Date.parse(`${fromISO}T00:00:00Z`);
  const to = Date.parse(`${toISO}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return Infinity;
  return Math.round((to - from) / 86_400_000);
}

/**
 * Whether the pre-permission screen is due: the OS can still be asked, the
 * user has seen briefs on at least two days (so this is day 2 or later),
 * fewer than two asks have happened ever, and any earlier "Not yet" is at
 * least 7 days old.
 */
export function primerDue(
  state: PrimerState,
  today: string,
  permission: PushPermission | null,
): boolean {
  if (permission !== "prompt") return false;
  if (state.briefDays.length < 2) return false;
  if (state.askCount >= 2) return false;
  if (state.lastAskAt !== null && daysBetween(state.lastAskAt, today) < 7) return false;
  return true;
}

/** localStorage wrappers; storage failures behave like a fresh state. */
export function loadPrimerState(): PrimerState {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_PRIMER;
    const parsed = JSON.parse(raw) as Partial<PrimerState>;
    return {
      briefDays: Array.isArray(parsed.briefDays) ? parsed.briefDays.filter((d) => typeof d === "string") : [],
      askCount: typeof parsed.askCount === "number" ? parsed.askCount : 0,
      lastAskAt: typeof parsed.lastAskAt === "string" ? parsed.lastAskAt : null,
    };
  } catch {
    return EMPTY_PRIMER;
  }
}

export function savePrimerState(state: PrimerState): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage full or unavailable: the primer just stays conservative
  }
}
