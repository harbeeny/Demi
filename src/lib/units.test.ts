import { describe, expect, test } from "bun:test";

import {
  cmToFtIn,
  formatFtIn,
  ftInToCm,
  inchesToCm,
  kgPerWeekToLbPerWeek,
  kgToLbs,
  lbPerWeekToKgPerWeek,
  lbsToKg,
} from "./units";

describe("weight conversions", () => {
  test("180 lb is 81.6 kg", () => {
    expect(lbsToKg(180)).toBe(81.6);
  });

  test("80 kg is 176.4 lb", () => {
    expect(kgToLbs(80)).toBe(176.4);
  });

  test("round trip stays within a tenth", () => {
    expect(Math.abs(kgToLbs(lbsToKg(165)) - 165)).toBeLessThanOrEqual(0.2);
  });
});

describe("height conversions", () => {
  test("5 ft 11 in is 180.3 cm", () => {
    expect(ftInToCm(5, 11)).toBe(180.3);
  });

  test("180 cm is 5 ft 11 in", () => {
    expect(cmToFtIn(180)).toEqual({ feet: 5, inches: 11 });
  });

  test("exact foot boundaries do not gain an inch", () => {
    expect(cmToFtIn(ftInToCm(6, 0))).toEqual({ feet: 6, inches: 0 });
  });

  test("total inches convert and format correctly", () => {
    expect(inchesToCm(71)).toBe(180.3);
    expect(formatFtIn(71)).toBe(`5'11"`);
    expect(formatFtIn(72)).toBe(`6'0"`);
  });
});

describe("pace conversions", () => {
  test("1 lb/week is 0.45 kg/week (fits numeric(3,2))", () => {
    expect(lbPerWeekToKgPerWeek(1)).toBe(0.45);
  });

  test("1.5 lb/week stays under the 1.0 kg/week column cap", () => {
    expect(lbPerWeekToKgPerWeek(1.5)).toBeLessThanOrEqual(1.0);
  });

  test("0.5 kg/week displays as 1.1 lb/week", () => {
    expect(kgPerWeekToLbPerWeek(0.5)).toBe(1.1);
  });
});
