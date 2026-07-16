// Logging streak: consecutive days with at least one food logged. Today
// counts once something is logged; an empty today doesn't break the run
// until the day actually ends, so the streak shows through yesterday.

const DAY_MS = 24 * 60 * 60 * 1000;

function previousDay(iso: string): string {
  return new Date(Date.parse(iso) - DAY_MS).toISOString().slice(0, 10);
}

export function loggingStreak(loggedDates: Iterable<string>, today: string): number {
  const logged = new Set(loggedDates);
  let cursor = logged.has(today) ? today : previousDay(today);
  let streak = 0;
  while (logged.has(cursor)) {
    streak += 1;
    cursor = previousDay(cursor);
  }
  return streak;
}

/** The trailing `count` dates ending at `today`, ascending. */
export function trailingDates(today: string, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    out.push(new Date(Date.parse(today) - i * DAY_MS).toISOString().slice(0, 10));
  }
  return out;
}
