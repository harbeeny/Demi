import { describe, expect, test } from "bun:test";

import { device24HourClock, formatTimeHour, localDateISO, localHour } from "./dates";

// 02:00 UTC on July 16: still July 15 evening in New York, already July 16
// afternoon in Kiritimati (UTC+14).
const AT = new Date("2026-07-16T02:00:00Z");

describe("localDateISO", () => {
  test("resolves the local calendar day, not the UTC one", () => {
    expect(localDateISO("America/New_York", AT)).toBe("2026-07-15");
    expect(localDateISO("Pacific/Kiritimati", AT)).toBe("2026-07-16");
    expect(localDateISO("UTC", AT)).toBe("2026-07-16");
  });

  test("invalid or missing timezone falls back to UTC", () => {
    expect(localDateISO("Not/AZone", AT)).toBe("2026-07-16");
    expect(localDateISO(null, AT)).toBe(localDateISO(undefined, AT));
  });

  test("winter dates honor standard time offsets", () => {
    const winter = new Date("2026-01-16T03:00:00Z");
    expect(localDateISO("America/New_York", winter)).toBe("2026-01-15");
  });
});

describe("localHour", () => {
  test("returns the fractional local hour", () => {
    expect(localHour("America/New_York", AT)).toBe(22); // 02:00 UTC = 22:00 EDT
    expect(localHour("UTC", AT)).toBe(2);
    const halfPast = new Date("2026-07-16T02:30:00Z");
    expect(localHour("UTC", halfPast)).toBe(2.5);
  });

  test("invalid timezone falls back to UTC hours", () => {
    expect(localHour("Not/AZone", AT)).toBe(2);
  });

  test("midnight stays 0, never 24", () => {
    const midnight = new Date("2026-07-16T00:00:00Z");
    expect(localHour("UTC", midnight)).toBe(0);
  });
});

describe("formatTimeHour", () => {
  test("defaults to 12-hour when the preference is unknown", () => {
    expect(formatTimeHour(14)).toBe("2:00 pm");
    expect(formatTimeHour(13.5, null)).toBe("1:30 pm");
    expect(formatTimeHour(9.25, false)).toBe("9:15 am");
  });

  test("keeps 24-hour labels for users who prefer them", () => {
    expect(formatTimeHour(14, true)).toBe("14:00");
    expect(formatTimeHour(9.25, true)).toBe("9:15");
  });

  test("noon and midnight read as 12, not 0", () => {
    expect(formatTimeHour(12)).toBe("12:00 pm");
    expect(formatTimeHour(0)).toBe("12:00 am");
    expect(formatTimeHour(0, true)).toBe("0:00");
  });

  test("minute rounding carries into the next hour instead of :60", () => {
    expect(formatTimeHour(12.9999)).toBe("1:00 pm");
    expect(formatTimeHour(23.9999, true)).toBe("0:00");
  });
});

describe("device24HourClock", () => {
  test("answers with a boolean or admits it can't say", () => {
    const pref = device24HourClock();
    expect(pref === null || typeof pref === "boolean").toBe(true);
  });
});
