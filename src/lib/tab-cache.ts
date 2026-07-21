/**
 * Per-tab snapshot cache: stale-while-revalidate for screen data. A tab
 * paints its last known data instantly (memory first, localStorage on cold
 * launch) and the hook refreshes in the background, so revisits and app
 * relaunches skip the loading gate entirely.
 *
 * Keys must be user-scoped by the caller (e.g. `today:<userId>:<date>`) so
 * one account's data can never paint for another. Sign-out clears the lot.
 */

const memory = new Map<string, unknown>();

const PREFIX = "demi:snap:";
/** Bump when any snapshot's shape changes; old snapshots are discarded. */
const VERSION = 3;
/** Snapshots older than this only feed the background refresh, not paint. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface Envelope<T> {
  v: number;
  at: number;
  data: T;
}

export function readSnapshot<T>(key: string): T | null {
  if (memory.has(key)) return memory.get(key) as T;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<T>;
    if (env.v !== VERSION || Date.now() - env.at > MAX_AGE_MS) return null;
    memory.set(key, env.data);
    return env.data;
  } catch {
    return null;
  }
}

export function writeSnapshot<T>(key: string, data: T): void {
  memory.set(key, data);
  try {
    const env: Envelope<T> = { v: VERSION, at: Date.now(), data };
    localStorage.setItem(PREFIX + key, JSON.stringify(env));
  } catch {
    // storage full or unavailable: the in-memory copy still works this visit
  }
}

/** Sign-out hygiene: cached personal data must not outlive the session. */
export function clearSnapshots(): void {
  memory.clear();
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    // storage unavailable: nothing persisted there to clear
  }
}
