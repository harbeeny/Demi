import { describe, expect, test } from "bun:test";

import { shiftDeltaFor, weekdayNameISO } from "./shift";

const base = { calorieDistribution: "shift" as const, trainingDays: ["monday", "wednesday", "friday"] };

describe("shiftDeltaFor", () => {
  test("training days go up, rest days give the same weekly total back", () => {
    // 2026-07-20 is a Monday
    const up = shiftDeltaFor(base, "2026-07-20", 2200, 1500);
    const down = shiftDeltaFor(base, "2026-07-21", 2200, 1500);
    expect(up).toBe(Math.round(0.08 * 2200)); // 176
    expect(down).toBe(-Math.round((176 * 3) / 4)); // -132
    // week sums to ~zero (rounding drift under one kcal/day)
    expect(Math.abs(up * 3 + down * 4)).toBeLessThanOrEqual(4);
  });

  test("even, null, no training days, or all-week training mean no shift", () => {
    expect(shiftDeltaFor({ calorieDistribution: "even", trainingDays: ["monday"] }, "2026-07-20", 2200, 1500)).toBe(0);
    expect(shiftDeltaFor({ calorieDistribution: null, trainingDays: ["monday"] }, "2026-07-20", 2200, 1500)).toBe(0);
    expect(shiftDeltaFor({ calorieDistribution: "shift", trainingDays: [] }, "2026-07-20", 2200, 1500)).toBe(0);
    expect(
      shiftDeltaFor(
        { calorieDistribution: "shift", trainingDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] },
        "2026-07-20", 2200, 1500,
      ),
    ).toBe(0);
  });

  test("rest-day reduction never breaches the floor: bump shrinks instead", () => {
    // target barely above floor: rest days can only give up 50 kcal
    const sixTraining = { calorieDistribution: "shift" as const, trainingDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] };
    const up = shiftDeltaFor(sixTraining, "2026-07-20", 1550, 1500);
    const down = shiftDeltaFor(sixTraining, "2026-07-26", 1550, 1500); // Sunday, the lone rest day
    expect(up).toBeLessThanOrEqual(Math.floor(50 / 6));
    expect(1550 + down).toBeGreaterThanOrEqual(1500);
  });

  test("weekday mapping is UTC-stable", () => {
    expect(weekdayNameISO("2026-07-20")).toBe("monday");
    expect(weekdayNameISO("2026-07-26")).toBe("sunday");
  });
});
