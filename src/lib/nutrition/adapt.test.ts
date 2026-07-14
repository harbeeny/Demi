import { describe, expect, test } from "bun:test";

import { targets } from "./targets";
import {
  detectAdjustment,
  weightTrendKgPerWeek,
  type LoggedDay,
  type WeighIn,
} from "./adapt";
import type { ProfileInput } from "./types";

// base: BMR 1780, TDEE (moderate) 2759, lose_fat 0.5 kg/wk -> target 2209
const base: ProfileInput = {
  sex: "male",
  age: 30,
  heightCm: 180,
  weightKg: 80,
  goal: "lose_fat",
  goalRate: 0.5,
  activityLevel: "moderate",
  mealsPerDay: 3,
  eatingWindowStart: 8,
  eatingWindowEnd: 20,
  trainingDays: [],
  trainingTime: null,
};

/** ISO date n days after Jul 1 2026. */
const day = (n: number) => new Date(Date.UTC(2026, 6, 1 + n)).toISOString().slice(0, 10);

/** weigh-ins every `step` days across `count` points at `slopeKgPerWeek`. */
function weighSeries(slopeKgPerWeek: number, count = 7, step = 2, startKg = 80): WeighIn[] {
  return Array.from({ length: count }, (_, i) => ({
    date: day(i * step),
    weightKg: startKg + (slopeKgPerWeek * i * step) / 7,
  }));
}

function loggedSeries(avgKcal: number, count = 12): LoggedDay[] {
  return Array.from({ length: count }, (_, i) => ({ date: day(i), totalKcal: avgKcal }));
}

const run = (
  overrides: Partial<Parameters<typeof detectAdjustment>[0]> & { profile?: ProfileInput },
) => {
  const profile = overrides.profile ?? base;
  return detectAdjustment({
    weighIns: overrides.weighIns ?? weighSeries(-0.5),
    loggedDays: overrides.loggedDays ?? loggedSeries(2209),
    profile,
    current: targets(profile),
  });
};

describe("weightTrendKgPerWeek", () => {
  test("perfectly linear series returns the exact slope", () => {
    expect(weightTrendKgPerWeek(weighSeries(-0.5))).toBeCloseTo(-0.5, 5);
    expect(weightTrendKgPerWeek(weighSeries(0.25))).toBeCloseTo(0.25, 5);
  });

  test("flat series returns 0; fewer than 2 points return 0", () => {
    expect(weightTrendKgPerWeek(weighSeries(0))).toBe(0);
    expect(weightTrendKgPerWeek([{ date: day(0), weightKg: 80 }])).toBe(0);
  });

  test("slope uses day offsets, not array index", () => {
    // same weights, but the last point is far out in time: slope shrinks
    const even: WeighIn[] = [
      { date: day(0), weightKg: 80 },
      { date: day(2), weightKg: 79.8 },
      { date: day(4), weightKg: 79.6 },
    ];
    const stretched: WeighIn[] = [
      { date: day(0), weightKg: 80 },
      { date: day(2), weightKg: 79.8 },
      { date: day(12), weightKg: 79.6 },
    ];
    expect(Math.abs(weightTrendKgPerWeek(stretched))).toBeLessThan(
      Math.abs(weightTrendKgPerWeek(even)),
    );
  });
});

describe("detectAdjustment gates", () => {
  test("too few weigh-ins", () => {
    const r = run({ weighIns: weighSeries(-0.5, 3) });
    expect(r.proposal).toBeNull();
    expect(r.insufficientData).toContain("too_few_weigh_ins");
  });

  test("weigh-ins spanning too few days", () => {
    const r = run({ weighIns: weighSeries(-0.5, 5, 1) }); // 5 points across 4 days
    expect(r.insufficientData).toContain("weigh_in_span_too_short");
  });

  test("too few logged days, and multiple reasons accumulate", () => {
    const r = run({ weighIns: weighSeries(-0.5, 3), loggedDays: loggedSeries(2200, 8) });
    expect(r.insufficientData).toEqual(
      expect.arrayContaining(["too_few_weigh_ins", "too_few_logged_days"]),
    );
  });

  test("on-track user gets no proposal", () => {
    // observed -0.5 matches the target-implied -0.5 within threshold
    const r = run({ weighIns: weighSeries(-0.5), loggedDays: loggedSeries(2209) });
    expect(r.proposal).toBeNull();
    expect(r.insufficientData).toEqual(["no_divergence"]);
  });

  test("minor profile stops immediately with only the safety reason", () => {
    const r = run({ profile: { ...base, age: 16 } });
    expect(r.insufficientData).toEqual(["safety_maintenance_active"]);
  });

  test("underweight profile stops the same way", () => {
    const r = run({ profile: { ...base, weightKg: 55, heightCm: 185 } });
    expect(r.insufficientData).toEqual(["safety_maintenance_active"]);
  });
});

describe("detectAdjustment proposals", () => {
  test("lose_fat losing slower than plan proposes a bounded cut", () => {
    // avg 2200, observed -0.2: implied TDEE 2420, raw -339 -> step clamp -200
    const r = run({ weighIns: weighSeries(-0.2), loggedDays: loggedSeries(2200) });
    expect(r.proposal?.correctionDelta).toBe(-200);
    expect(r.proposal?.newCorrection).toBe(-200);
  });

  test("lose_fat losing faster than plan proposes a raise", () => {
    // avg 2200, observed -0.7: implied 2970, raw +211 -> +200
    const r = run({ weighIns: weighSeries(-0.7), loggedDays: loggedSeries(2200) });
    expect(r.proposal?.correctionDelta).toBe(200);
  });

  test("build_muscle gaining faster than goal proposes a cut", () => {
    const profile: ProfileInput = { ...base, goal: "build_muscle", goalRate: 0.25 };
    // target 2759+275=3034; avg 3000, observed +0.5: implied 2450, raw -309 -> -200
    const r = run({ profile, weighIns: weighSeries(0.5), loggedDays: loggedSeries(3000) });
    expect(r.proposal?.correctionDelta).toBe(-200);
  });

  test("maintain user drifting up gets a cut proposal (first-class support)", () => {
    const profile: ProfileInput = { ...base, goal: "maintain", goalRate: null };
    // target = TDEE 2759; avg 2500, observed +0.2: implied 2280, raw -479 -> -200
    const r = run({ profile, weighIns: weighSeries(0.2), loggedDays: loggedSeries(2500) });
    expect(r.proposal?.correctionDelta).toBe(-200);
  });

  test("exact small delta is computed unclamped", () => {
    // avg 2560, observed -0.3: implied 2890, raw +131 -> proposal of exactly +131
    const r = run({ weighIns: weighSeries(-0.3), loggedDays: loggedSeries(2560) });
    expect(r.proposal?.correctionDelta).toBe(131);
  });
});

describe("detectAdjustment clamps and credibility", () => {
  test("per-step clamp at 200, cumulative clamp at 500", () => {
    // existing -400; avg 1900, observed -0.1: implied 2010 vs est 2359 -> raw -349
    // cumulative -749 clamps to -500 -> delta -100
    const profile: ProfileInput = { ...base, tdeeCorrection: -400 };
    const r = run({ profile, weighIns: weighSeries(-0.1), loggedDays: loggedSeries(1900) });
    expect(r.proposal?.correctionDelta).toBe(-100);
    expect(r.proposal?.newCorrection).toBe(-500);
  });

  test("cumulative cap exhausted yields no proposal", () => {
    const profile: ProfileInput = { ...base, tdeeCorrection: -500 };
    const r = run({ profile, weighIns: weighSeries(-0.1), loggedDays: loggedSeries(1900) });
    expect(r.proposal).toBeNull();
    expect(r.insufficientData).toEqual(["cumulative_correction_reached"]);
  });

  test("noise-sized delta is not proposed", () => {
    // avg 2459, observed -0.3: implied 2789, raw +30 < 50
    const r = run({ weighIns: weighSeries(-0.3), loggedDays: loggedSeries(2459) });
    expect(r.insufficientData).toEqual(["delta_too_small"]);
  });

  test("under-logging blocks cuts but not raises", () => {
    // avg 1400 << 75% of 2209: negative delta blocked
    const cut = run({ weighIns: weighSeries(-0.3), loggedDays: loggedSeries(1400) });
    expect(cut.insufficientData).toEqual(["low_logging_adherence"]);
    // same low avg, but fast loss makes the delta positive: allowed
    const raise = run({ weighIns: weighSeries(-1.5), loggedDays: loggedSeries(1400) });
    expect(raise.proposal?.correctionDelta).toBe(200);
  });

  test("implausibly low implied TDEE blocks cuts", () => {
    // avg 1700 passes adherence, observed +0.1: implied 1590 < 0.9*BMR (1602)
    const r = run({ weighIns: weighSeries(0.1), loggedDays: loggedSeries(1700) });
    expect(r.insufficientData).toEqual(["implausible_low_tdee"]);
  });

  test("floored target blocks cuts but allows raises", () => {
    // sedentary small female: TDEE 1523, target floored at 1200
    const profile: ProfileInput = {
      ...base,
      sex: "female",
      heightCm: 160,
      weightKg: 58,
      activityLevel: "sedentary",
    };
    expect(targets(profile).flooredBySafety).toBe(true);
    const cut = run({
      profile,
      weighIns: weighSeries(0.1, 7, 2, 58),
      loggedDays: loggedSeries(1300),
    });
    expect(cut.insufficientData).toEqual(["target_at_floor"]);
    const raise = run({
      profile,
      weighIns: weighSeries(-0.5, 7, 2, 58),
      loggedDays: loggedSeries(1400),
    });
    expect(raise.proposal?.correctionDelta).toBe(200);
  });
});

describe("proposal metadata", () => {
  test("confidence thresholds", () => {
    const moderate = run({ weighIns: weighSeries(-0.2, 5, 3), loggedDays: loggedSeries(2200, 10) });
    expect(moderate.proposal?.confidence).toBe("moderate");
    const high = run({ weighIns: weighSeries(-0.2, 8, 2), loggedDays: loggedSeries(2200, 12) });
    expect(high.proposal?.confidence).toBe("high");
  });

  test("rationale is complete, neutral, and em-dash free", () => {
    const r = run({ weighIns: weighSeries(-0.2), loggedDays: loggedSeries(2200) });
    const rat = r.proposal?.rationale;
    expect(rat?.rule).toBe("tdee_correction_from_intake_and_trend");
    expect(rat?.inputs.impliedTdee).toBeDefined();
    expect(rat?.inputs.currentEstTdee).toBeDefined();
    expect(rat?.explanation).toContain("kcal");
    expect(rat?.explanation).toContain("kg per week");
    expect(rat?.explanation).not.toContain("—");
    expect(rat?.explanation).not.toMatch(/you under-ate|you overate|failed|cheat/i);
  });
});
