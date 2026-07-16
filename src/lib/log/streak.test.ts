import { describe, expect, test } from "bun:test";

import { loggingStreak, trailingDates } from "./streak";

describe("loggingStreak", () => {
  test("counts consecutive days ending today", () => {
    expect(loggingStreak(["2026-07-15", "2026-07-14", "2026-07-13"], "2026-07-15")).toBe(3);
  });

  test("an empty today falls back to the run ending yesterday", () => {
    expect(loggingStreak(["2026-07-14", "2026-07-13"], "2026-07-15")).toBe(2);
  });

  test("a gap breaks the run", () => {
    expect(loggingStreak(["2026-07-15", "2026-07-13"], "2026-07-15")).toBe(1);
    expect(loggingStreak(["2026-07-12", "2026-07-11"], "2026-07-15")).toBe(0);
  });

  test("no logs at all is zero", () => {
    expect(loggingStreak([], "2026-07-15")).toBe(0);
  });

  test("month boundaries count correctly", () => {
    expect(loggingStreak(["2026-07-01", "2026-06-30", "2026-06-29"], "2026-07-01")).toBe(3);
  });
});

describe("trailingDates", () => {
  test("returns the trailing window ascending, ending today", () => {
    expect(trailingDates("2026-07-15", 3)).toEqual(["2026-07-13", "2026-07-14", "2026-07-15"]);
  });

  test("crosses month starts", () => {
    expect(trailingDates("2026-07-02", 3)).toEqual(["2026-06-30", "2026-07-01", "2026-07-02"]);
  });
});
