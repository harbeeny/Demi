import { describe, expect, test } from "bun:test";

import { applyKcalDelta, planSpread, remainingWeekDates } from "./balance";

// 2026-07-15 is a Wednesday; the week runs Mon 07-13 through Sun 07-19.

describe("remainingWeekDates", () => {
  test("Wednesday leaves Thu through Sun", () => {
    expect(remainingWeekDates("2026-07-15")).toEqual([
      "2026-07-16",
      "2026-07-17",
      "2026-07-18",
      "2026-07-19",
    ]);
  });

  test("Friday leaves Sat and Sun", () => {
    expect(remainingWeekDates("2026-07-17")).toEqual(["2026-07-18", "2026-07-19"]);
  });

  test("Saturday leaves only Sunday", () => {
    expect(remainingWeekDates("2026-07-18")).toEqual(["2026-07-19"]);
  });

  test("Sunday leaves nothing (next week starts clean)", () => {
    expect(remainingWeekDates("2026-07-19")).toEqual([]);
  });

  test("crosses month boundaries", () => {
    // 2026-07-31 is a Friday
    expect(remainingWeekDates("2026-07-31")).toEqual(["2026-08-01", "2026-08-02"]);
  });
});

describe("planSpread", () => {
  const base = { targetKcal: 2000, floorKcal: 1500 };

  test("spreads evenly under the cap", () => {
    // Wed, 400 over, 4 days left: 100 each, cap is 200
    const plan = planSpread({ overageKcal: 400, sourceDate: "2026-07-15", ...base });
    expect(plan.days).toEqual([
      { date: "2026-07-16", deltaKcal: -100 },
      { date: "2026-07-17", deltaKcal: -100 },
      { date: "2026-07-18", deltaKcal: -100 },
      { date: "2026-07-19", deltaKcal: -100 },
    ]);
    expect(plan.absorbed).toBe(400);
    expect(plan.forgiven).toBe(0);
  });

  test("caps each day at 10% of target and forgives the rest", () => {
    // 2000 over on Friday: 2 days left, cap 200 each, 1600 forgiven
    const plan = planSpread({ overageKcal: 2000, sourceDate: "2026-07-17", ...base });
    expect(plan.days).toEqual([
      { date: "2026-07-18", deltaKcal: -200 },
      { date: "2026-07-19", deltaKcal: -200 },
    ]);
    expect(plan.absorbed).toBe(400);
    expect(plan.forgiven).toBe(1600);
  });

  test("cap also respects the safety floor when it is nearer than 10%", () => {
    // target 1550, floor 1500: cap is 50, not 155
    const plan = planSpread({
      overageKcal: 300,
      sourceDate: "2026-07-17",
      targetKcal: 1550,
      floorKcal: 1500,
    });
    expect(plan.days.every((d) => d.deltaKcal === -50)).toBe(true);
    expect(plan.absorbed).toBe(100);
    expect(plan.forgiven).toBe(200);
  });

  test("a target already at the floor absorbs nothing", () => {
    const plan = planSpread({
      overageKcal: 500,
      sourceDate: "2026-07-15",
      targetKcal: 1500,
      floorKcal: 1500,
    });
    expect(plan.days).toEqual([]);
    expect(plan.forgiven).toBe(500);
  });

  test("Sunday overage is fully forgiven", () => {
    const plan = planSpread({ overageKcal: 800, sourceDate: "2026-07-19", ...base });
    expect(plan.days).toEqual([]);
    expect(plan.absorbed).toBe(0);
    expect(plan.forgiven).toBe(800);
  });

  test("uneven remainders never absorb more than the overage", () => {
    // 100 over 4 days: 25 each, exact
    const even = planSpread({ overageKcal: 100, sourceDate: "2026-07-15", ...base });
    expect(even.absorbed).toBe(100);
    // 103 over 4 days: 26,26,26,25
    const odd = planSpread({ overageKcal: 103, sourceDate: "2026-07-15", ...base });
    expect(odd.days.map((d) => d.deltaKcal)).toEqual([-26, -26, -26, -25]);
    expect(odd.absorbed).toBe(103);
    expect(odd.forgiven).toBe(0);
  });

  test("stacked balances respect each day's remaining capacity", () => {
    // Thursday balance while Wednesday's already shaves 150 off Fri/Sat/Sun:
    // only 50 of capacity left per day (cap 200)
    const plan = planSpread({
      overageKcal: 600,
      sourceDate: "2026-07-16",
      ...base,
      existingReductionByDate: { "2026-07-17": 150, "2026-07-18": 150, "2026-07-19": 150 },
    });
    expect(plan.days).toEqual([
      { date: "2026-07-17", deltaKcal: -50 },
      { date: "2026-07-18", deltaKcal: -50 },
      { date: "2026-07-19", deltaKcal: -50 },
    ]);
    expect(plan.absorbed).toBe(150);
    expect(plan.forgiven).toBe(450);
  });

  test("a fully saturated day is skipped entirely", () => {
    const plan = planSpread({
      overageKcal: 300,
      sourceDate: "2026-07-17",
      ...base,
      existingReductionByDate: { "2026-07-18": 200 },
    });
    expect(plan.days).toEqual([{ date: "2026-07-19", deltaKcal: -150 }]);
    expect(plan.forgiven).toBe(150);
  });

  test("per-day cut never exceeds the DB bound even for huge targets", () => {
    // 10% of a 5600 kcal target would be 560, past the ±500 check constraint
    const plan = planSpread({
      overageKcal: 3000,
      sourceDate: "2026-07-15",
      targetKcal: 5600,
      floorKcal: 2000,
    });
    expect(plan.days.every((d) => d.deltaKcal >= -500)).toBe(true);
  });

  test("zero or negative overage plans nothing", () => {
    expect(planSpread({ overageKcal: 0, sourceDate: "2026-07-15", ...base }).days).toEqual([]);
    expect(planSpread({ overageKcal: -50, sourceDate: "2026-07-15", ...base }).forgiven).toBe(0);
  });

  // The retroactive big-night flow: it's Thursday morning and last night
  // (Wednesday) just got logged. The spread starts AT today, and today is
  // capped like any other day: it never absorbs the night whole.
  test("yesterday as source includes today, capped like any other day", () => {
    const plan = planSpread({ overageKcal: 2000, sourceDate: "2026-07-15", ...base });
    expect(plan.days[0]).toEqual({ date: "2026-07-16", deltaKcal: -200 });
    expect(plan.days.every((d) => d.deltaKcal >= -200)).toBe(true);
    expect(plan.absorbed).toBe(800);
    expect(plan.forgiven).toBe(1200);
  });

  test("a Saturday night logged Sunday morning still uses Sunday", () => {
    const plan = planSpread({ overageKcal: 600, sourceDate: "2026-07-18", ...base });
    expect(plan.days).toEqual([{ date: "2026-07-19", deltaKcal: -200 }]);
    expect(plan.forgiven).toBe(400);
  });

  test("a Sunday night logged Monday morning is fully forgiven (closed week)", () => {
    const plan = planSpread({ overageKcal: 1500, sourceDate: "2026-07-19", ...base });
    expect(plan.days).toEqual([]);
    expect(plan.forgiven).toBe(1500);
  });

  test("retro spread stacks under existing reductions on today", () => {
    // Yesterday's balance while today already carries 120 from an older
    // balance: today's remaining capacity is 80, later days take 200.
    const plan = planSpread({
      overageKcal: 900,
      sourceDate: "2026-07-15",
      ...base,
      existingReductionByDate: { "2026-07-16": 120 },
    });
    expect(plan.days[0]).toEqual({ date: "2026-07-16", deltaKcal: -80 });
    expect(plan.days.slice(1).every((d) => d.deltaKcal === -200)).toBe(true);
  });
});

describe("applyKcalDelta", () => {
  const totals = { kcal: 2000, proteinG: 150, carbsG: 200, fatG: 67 };

  test("protein never moves; carbs and fat absorb the cut", () => {
    const adjusted = applyKcalDelta(totals, -200, 1500);
    expect(adjusted.kcal).toBe(1800);
    expect(adjusted.proteinG).toBe(150);
    expect(adjusted.carbsG).toBeLessThan(totals.carbsG);
    expect(adjusted.fatG).toBeLessThanOrEqual(totals.fatG);
    // 4/4/9 self-consistency within rounding
    const sum = adjusted.proteinG * 4 + adjusted.carbsG * 4 + adjusted.fatG * 9;
    expect(Math.abs(sum - adjusted.kcal)).toBeLessThanOrEqual(4);
  });

  test("clamps at the floor even for a bigger delta", () => {
    const adjusted = applyKcalDelta(totals, -800, 1900);
    expect(adjusted.kcal).toBe(1900);
  });

  test("no-op delta returns the same totals", () => {
    expect(applyKcalDelta(totals, 0, 1500)).toEqual(totals);
  });

  test("macros never go negative", () => {
    const lean = { kcal: 1600, proteinG: 180, carbsG: 100, fatG: 40 };
    const adjusted = applyKcalDelta(lean, -160, 1200);
    expect(adjusted.carbsG).toBeGreaterThanOrEqual(0);
    expect(adjusted.fatG).toBeGreaterThanOrEqual(0);
  });
});

describe("planSpread strategies and shift-aware caps", () => {
  test("front strategy fills nearest days to their caps first", () => {
    // Wednesday source: Thu/Fri/Sat/Sun remain; cap = 10% of 2000 = 200
    const plan = planSpread({ overageKcal: 300, sourceDate: "2026-07-22", targetKcal: 2000, floorKcal: 1200, strategy: "front" });
    expect(plan.days).toEqual([
      { date: "2026-07-23", deltaKcal: -200 },
      { date: "2026-07-24", deltaKcal: -100 },
    ]);
    expect(plan.absorbed).toBe(300);
    expect(plan.forgiven).toBe(0);
  });

  test("shiftByDate lowers a shifted-down day's cap and raises a shifted-up day's", () => {
    // Thursday shifted -150: its real target is 1850, cap 185; Friday +150: cap 215
    const plan = planSpread({
      overageKcal: 400,
      sourceDate: "2026-07-22",
      targetKcal: 2000,
      floorKcal: 1200,
      strategy: "front",
      shiftByDate: { "2026-07-23": -150, "2026-07-24": 150 },
    });
    expect(plan.days[0]).toEqual({ date: "2026-07-23", deltaKcal: -185 });
    expect(plan.days[1]).toEqual({ date: "2026-07-24", deltaKcal: -215 });
  });

  test("even strategy is unchanged by default", () => {
    const plan = planSpread({ overageKcal: 300, sourceDate: "2026-07-22", targetKcal: 2000, floorKcal: 1200 });
    expect(plan.days.map((d) => d.deltaKcal)).toEqual([-75, -75, -75, -75]);
  });
});
