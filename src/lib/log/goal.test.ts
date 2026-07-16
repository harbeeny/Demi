import { describe, expect, test } from "bun:test";

import { kcalGoalMet } from "./goal";

describe("kcalGoalMet", () => {
  test("met when eaten is inside the 90-110% band", () => {
    expect(kcalGoalMet(2000, 2000)).toBe(true);
    expect(kcalGoalMet(1800, 2000)).toBe(true); // exactly 90%
    expect(kcalGoalMet(2200, 2000)).toBe(true); // exactly 110%
    expect(kcalGoalMet(2085, 2085)).toBe(true);
  });

  test("not met below the band", () => {
    expect(kcalGoalMet(1799, 2000)).toBe(false);
    expect(kcalGoalMet(500, 2000)).toBe(false);
  });

  test("not met above the band (overeating is not goal met)", () => {
    expect(kcalGoalMet(2201, 2000)).toBe(false);
    expect(kcalGoalMet(3000, 2000)).toBe(false);
  });

  test("never met with no intake or no target", () => {
    expect(kcalGoalMet(0, 2000)).toBe(false);
    expect(kcalGoalMet(2000, 0)).toBe(false);
    expect(kcalGoalMet(0, 0)).toBe(false);
    expect(kcalGoalMet(-100, 2000)).toBe(false);
    expect(kcalGoalMet(2000, -1)).toBe(false);
  });
});
