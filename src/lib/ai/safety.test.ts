import { describe, expect, test } from "bun:test";

import { extractNumbers, numbersAreGrounded, stripEmDashes } from "./validate";
import { containsDisorderedEatingSignal, SUPPORTIVE_RESPONSE } from "./safety-filter";

describe("extractNumbers", () => {
  test("finds integers, decimals, and comma-grouped numbers", () => {
    const nums = extractNumbers("2,240 kcal with 164 g protein and 0.5 kg");
    expect(nums.has(2240)).toBe(true);
    expect(nums.has(164)).toBe(true);
    expect(nums.has(0.5)).toBe(true);
  });
});

describe("numbersAreGrounded", () => {
  const input = JSON.stringify({ kcal: 2240, proteinG: 164, meals: [{ kcal: 480 }] });

  test("accepts output that only repeats input numbers", () => {
    expect(numbersAreGrounded("This 480 kcal breakfast supports your 164 g protein day.", input)).toBe(true);
  });

  test("rejects invented nutrition numbers", () => {
    expect(numbersAreGrounded("Aim for 1800 kcal instead.", input)).toBe(false);
    expect(numbersAreGrounded("That's roughly 95 g of carbs.", input)).toBe(false);
  });

  test("allows small counts used as phrasing", () => {
    expect(numbersAreGrounded("Your 3 meals are spaced 6 hours apart.", input)).toBe(true);
  });

  test("accepts output with no numbers at all", () => {
    expect(numbersAreGrounded("A steady, satisfying day of eating.", input)).toBe(true);
  });
});

describe("stripEmDashes", () => {
  test("replaces em-dashes with a comma and space, however they were spaced", () => {
    expect(stripEmDashes("life gets in the way—sometimes")).toBe("life gets in the way, sometimes");
    expect(stripEmDashes("one thing — another")).toBe("one thing, another");
  });

  test("leaves clean text and hyphens untouched", () => {
    expect(stripEmDashes("a protein-forward snack, nothing else")).toBe(
      "a protein-forward snack, nothing else",
    );
  });
});

describe("containsDisorderedEatingSignal", () => {
  test("flags disordered-eating signals", () => {
    for (const phrase of [
      "I purge after big meals",
      "should I take laxatives to lose faster",
      "I binge every night and hate it",
      "I want to starve myself thin",
      "I have an eating disorder",
      "I need to earn my food first",
      "thinking about a water fast",
    ]) {
      expect(containsDisorderedEatingSignal(phrase)).toBe(true);
    }
  });

  test("does not flag ordinary fitness talk", () => {
    for (const phrase of [
      "I want to lose body fat",
      "help me eat more protein",
      "I ate too much at dinner yesterday",
      "how many calories should I eat",
    ]) {
      expect(containsDisorderedEatingSignal(phrase)).toBe(false);
    }
  });

  test("supportive response includes a resource and gentle prompts", () => {
    expect(SUPPORTIVE_RESPONSE.text).toContain("NEDA");
    expect(SUPPORTIVE_RESPONSE.prompts.length).toBeGreaterThan(0);
  });
});
