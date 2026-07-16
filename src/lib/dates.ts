// Local-day resolution. The app's "day" boundary follows the user's timezone
// (profiles.timezone, captured from the device); anything invalid or missing
// falls back to UTC so a corrupt value can never break a request.

/** YYYY-MM-DD for `at` in the given IANA timezone (en-CA formats ISO-style). */
export function localDateISO(timeZone?: string | null, at: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone ?? undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

/** Fractional hour of day (e.g. 13.5) for `at` in the given IANA timezone. */
export function localHour(timeZone?: string | null, at: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timeZone ?? undefined,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(at);
    const h = Number(parts.find((p) => p.type === "hour")?.value);
    const m = Number(parts.find((p) => p.type === "minute")?.value);
    // Intl may render midnight as "24" in some ICU versions.
    if (Number.isFinite(h) && Number.isFinite(m)) return (h % 24) + m / 60;
  } catch {
    // invalid timezone: fall through to UTC
  }
  return at.getUTCHours() + at.getUTCMinutes() / 60;
}

/** The device's IANA timezone, or null when the runtime can't say. */
export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

/**
 * Meal-time label for copy and UI: 13.5 -> "1:30 pm", or "13:30" for users
 * whose clock runs 24-hour. A null/undefined preference means unknown and
 * falls back to 12-hour, the app's default voice.
 */
export function formatTimeHour(timeHour: number, prefers24h?: boolean | null): string {
  let h = Math.floor(timeHour);
  let m = Math.round((timeHour % 1) * 60);
  // Rounding can carry to a full hour (e.g. 12.999 -> 12:60).
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

/** True when the device clock prefers 24-hour time, null when unknowable. */
export function device24HourClock(): boolean | null {
  try {
    const { hour12, hourCycle } = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
    }).resolvedOptions();
    if (typeof hour12 === "boolean") return !hour12;
    if (hourCycle) return hourCycle === "h23" || hourCycle === "h24";
  } catch {
    // no Intl clock info: callers treat null as unknown
  }
  return null;
}
