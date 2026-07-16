import { describe, expect, test } from "bun:test";

import { DAY_KCAL_CEILING, exceedsDayCeiling, rollupTotals } from "./rollup";

describe("day ceiling", () => {
  test("normal days never come close", () => {
    expect(exceedsDayCeiling(2200, 800)).toBe(false);
    expect(exceedsDayCeiling(0, 3000)).toBe(false);
  });

  test("garbage accumulation is rejected at the line", () => {
    expect(exceedsDayCeiling(DAY_KCAL_CEILING - 100, 100)).toBe(false);
    expect(exceedsDayCeiling(DAY_KCAL_CEILING - 100, 101)).toBe(true);
    expect(exceedsDayCeiling(DAY_KCAL_CEILING, 1)).toBe(true);
  });

  test("ceiling keeps every rollup column inside numeric(6,2)", () => {
    // Worst case: an entire ceiling-day of pure protein (4 kcal/g) stays
    // under the 9,999.99 gram cap of the macro total columns.
    expect(DAY_KCAL_CEILING / 4).toBeLessThan(9_999.99);
  });
});

describe("rollupTotals", () => {
  test("sums and rounds to cents", () => {
    const t = rollupTotals([
      { kcal: 400.005, proteinG: 20, carbsG: 45, fatG: 15 },
      { kcal: 600, proteinG: 30.001, carbsG: 50, fatG: 20 },
    ]);
    expect(t.total_kcal).toBe(1000.01);
    expect(t.total_protein_g).toBe(50);
  });
});
