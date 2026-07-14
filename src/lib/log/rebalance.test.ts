import { describe, expect, test } from "bun:test";

import type { SlotTarget } from "@/lib/nutrition";
import { rebalanceSlotTargets, shouldOfferRebalance } from "./rebalance";

const totals = (kcal: number, proteinG = 0, carbsG = 0, fatG = 0) => ({
  kcal,
  proteinG,
  carbsG,
  fatG,
});

const slot = (slotName: SlotTarget["slot"], kcal: number, proteinG: number, carbsG: number, fatG: number, timeHour = 12): SlotTarget => ({
  slot: slotName,
  timeHour,
  kcal,
  proteinG,
  carbsG,
  fatG,
  reasoning: { rule: "test", inputs: {}, explanation: "" },
});

describe("shouldOfferRebalance", () => {
  test("false when nothing is upcoming", () => {
    expect(shouldOfferRebalance(totals(800), totals(0), 0)).toBe(false);
  });

  test("false when the budget is spent", () => {
    expect(shouldOfferRebalance(totals(0), totals(600), 2)).toBe(false);
    expect(shouldOfferRebalance(totals(-200), totals(600), 2)).toBe(false);
  });

  test("false when remaining roughly matches the upcoming plan", () => {
    expect(shouldOfferRebalance(totals(1000, 70), totals(1050, 72), 2)).toBe(false);
  });

  test("true when the kcal gap beats max(100, 10%)", () => {
    expect(shouldOfferRebalance(totals(700, 70), totals(1000, 70), 2)).toBe(true);
  });

  test("kcal gap under both thresholds does not trigger", () => {
    // gap 90 < max(100, 100) for a 1000 kcal upcoming group
    expect(shouldOfferRebalance(totals(910, 70), totals(1000, 70), 2)).toBe(false);
  });

  test("a protein gap alone can trigger", () => {
    expect(shouldOfferRebalance(totals(1000, 40), totals(1000, 70), 2)).toBe(true);
  });
});

describe("rebalanceSlotTargets", () => {
  test("preserves each slot's share of the upcoming group", () => {
    const dinner = slot("dinner", 800, 50, 80, 25, 19);
    const snack = slot("snack", 200, 10, 20, 8, 16);
    const out = rebalanceSlotTargets(totals(600, 50, 60, 20), [dinner, snack]);

    // dinner had 80% of the upcoming kcal, so it keeps ~80% of remaining carbs/fat
    expect(out[0].carbsG).toBe(48);
    expect(out[1].carbsG).toBe(12);
    expect(out[0].slot).toBe("dinner");
    expect(out[1].slot).toBe("snack");
  });

  test("protein splits evenly across remaining slots", () => {
    const out = rebalanceSlotTargets(totals(600, 50, 60, 20), [
      slot("dinner", 800, 50, 80, 25),
      slot("snack", 200, 10, 20, 8),
    ]);
    expect(out[0].proteinG).toBe(25);
    expect(out[1].proteinG).toBe(25);
  });

  test("kcal is recomputed from macros", () => {
    const out = rebalanceSlotTargets(totals(600, 50, 60, 20), [slot("dinner", 800, 50, 80, 25)]);
    expect(out[0].kcal).toBe(out[0].proteinG * 4 + out[0].carbsG * 4 + out[0].fatG * 9);
  });

  test("clamps exhausted macros at zero", () => {
    const out = rebalanceSlotTargets(totals(300, -10, -20, 15), [slot("dinner", 700, 40, 70, 20)]);
    expect(out[0].proteinG).toBe(0);
    expect(out[0].carbsG).toBe(0);
    expect(out[0].fatG).toBeGreaterThanOrEqual(0);
  });

  test("empty upcoming list returns empty", () => {
    expect(rebalanceSlotTargets(totals(500), [])).toEqual([]);
  });

  test("marks reasoning with the rebalance rule", () => {
    const out = rebalanceSlotTargets(totals(600, 50, 60, 20), [slot("dinner", 800, 50, 80, 25)]);
    expect(out[0].reasoning.rule).toBe("rebalance_remaining");
  });
});
