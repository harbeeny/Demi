import { describe, expect, test } from "bun:test";

import { validateEstimate } from "./estimate";

const good = {
  name: "Buttered toast, two slices",
  kcal: 320,
  proteinG: 8,
  carbsG: 34,
  fatG: 16,
  assumptions: "Two slices of white bread with a pat of butter each.",
};

describe("validateEstimate", () => {
  test("accepts a consistent estimate and rounds numbers", () => {
    const v = validateEstimate({ ...good, kcal: 320.4 });
    expect(v).not.toBeNull();
    expect(v?.kcal).toBe(320);
    expect(v?.name).toBe(good.name);
  });

  test("rejects non-objects and missing fields", () => {
    expect(validateEstimate(null)).toBeNull();
    expect(validateEstimate("toast")).toBeNull();
    expect(validateEstimate({ ...good, kcal: undefined })).toBeNull();
    expect(validateEstimate({ ...good, name: "" })).toBeNull();
  });

  test("rejects kcal out of (0, 3000]", () => {
    expect(validateEstimate({ ...good, kcal: 0 })).toBeNull();
    expect(validateEstimate({ ...good, kcal: 3001 })).toBeNull();
  });

  test("rejects negative or non-finite macros", () => {
    expect(validateEstimate({ ...good, proteinG: -1 })).toBeNull();
    expect(validateEstimate({ ...good, fatG: Number.NaN })).toBeNull();
    expect(validateEstimate({ ...good, carbsG: Infinity })).toBeNull();
  });

  test("rejects macro caps: protein 250, carbs 500, fat 250", () => {
    expect(validateEstimate({ ...good, proteinG: 251 })).toBeNull();
    expect(validateEstimate({ ...good, carbsG: 501 })).toBeNull();
    expect(validateEstimate({ ...good, fatG: 251 })).toBeNull();
  });

  test("rejects kcal inconsistent with macros beyond tolerance", () => {
    // macros say ~312 kcal; claiming 1500 is not credible
    expect(validateEstimate({ ...good, kcal: 1500 })).toBeNull();
  });

  test("allows kcal within the tolerance band", () => {
    // macros say 8*4 + 34*4 + 16*9 = 312; 400 is within max(100, 0.25*400)
    expect(validateEstimate({ ...good, kcal: 400 })).not.toBeNull();
  });

  test("rejects names over 120 chars", () => {
    expect(validateEstimate({ ...good, name: "x".repeat(121) })).toBeNull();
  });

  test("missing assumptions becomes empty string", () => {
    const { assumptions: _drop, ...rest } = good;
    expect(validateEstimate(rest)?.assumptions).toBe("");
  });
});
