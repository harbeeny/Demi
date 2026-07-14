import { describe, expect, test } from "bun:test";

import { remainingBudget, remainingCopy, sumLogged } from "./remaining";
import { rollupTotals, diffPlannedVsActual } from "./rollup";

const t = (kcal: number, proteinG = 0, carbsG = 0, fatG = 0) => ({ kcal, proteinG, carbsG, fatG });

describe("sumLogged", () => {
  test("sums all four macros", () => {
    expect(sumLogged([t(400, 30, 40, 10), t(600, 40, 60, 20)])).toEqual(t(1000, 70, 100, 30));
  });

  test("empty list is zero", () => {
    expect(sumLogged([])).toEqual(t(0));
  });
});

describe("remainingBudget", () => {
  test("subtracts eaten from targets", () => {
    expect(remainingBudget(t(2000, 150, 200, 60), t(800, 60, 90, 25))).toEqual(
      t(1200, 90, 110, 35),
    );
  });

  test("goes negative when past target", () => {
    expect(remainingBudget(t(2000, 150, 200, 60), t(2400, 160, 250, 80)).kcal).toBe(-400);
  });
});

describe("remainingCopy", () => {
  test("positive remaining names kcal and protein", () => {
    const copy = remainingCopy(t(620, 41, 50, 20));
    expect(copy).toContain("620 kcal");
    expect(copy).toContain("41 g protein");
  });

  test("protein already met drops the protein clause", () => {
    const copy = remainingCopy(t(300, -5, 30, 10));
    expect(copy).toContain("300 kcal");
    expect(copy).not.toContain("protein");
  });

  test("at or over target stays neutral: no shame, no praise, no urgency", () => {
    const copy = remainingCopy(t(-250, -10, -20, -5));
    expect(copy).toBe("You've reached your kcal target for today. Tomorrow is a fresh start.");
    expect(copy).not.toMatch(/over by|earn|deserve|only|great job|under|blew|too much/i);
  });

  test("copy never contains em-dashes", () => {
    for (const r of [t(620, 41), t(-100, -5)]) {
      expect(remainingCopy(r)).not.toContain("—");
    }
  });
});

describe("rollupTotals", () => {
  test("maps to daily_logs column shape", () => {
    expect(rollupTotals([t(400.005, 30, 40, 10)])).toEqual({
      total_kcal: 400.01,
      total_protein_g: 30,
      total_carbs_g: 40,
      total_fat_g: 10,
    });
  });
});

describe("diffPlannedVsActual", () => {
  test("delta is actual minus planned", () => {
    const d = diffPlannedVsActual(t(2000, 150, 200, 60), t(1800, 160, 170, 55));
    expect(d.delta).toEqual(t(-200, 10, -30, -5));
  });
});
