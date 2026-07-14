import { describe, expect, test } from "bun:test";

import { recentIdsFor, weekDates } from "./week";
import type { MealPlanEntry } from "@/lib/supabase/types";

const entry = (meal_id: string): MealPlanEntry => ({ meal_id, slot: "lunch", servings: 1 });

describe("weekDates", () => {
  test("seven consecutive dates from today", () => {
    expect(weekDates("2026-07-14")).toEqual([
      "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17",
      "2026-07-18", "2026-07-19", "2026-07-20",
    ]);
  });

  test("rolls over month and year boundaries", () => {
    expect(weekDates("2026-12-29")[3]).toBe("2027-01-01");
    expect(weekDates("2026-02-26")[4]).toBe("2026-03-02");
  });
});

describe("recentIdsFor", () => {
  test("pulls exactly the previous two days from a mixed map", () => {
    const plans = new Map<string, MealPlanEntry[]>([
      ["2026-07-12", [entry("a")]],      // from DB
      ["2026-07-13", [entry("b"), entry("c")]], // generated this batch
      ["2026-07-14", [entry("d")]],      // the date itself: excluded
    ]);
    expect(recentIdsFor("2026-07-14", plans).sort()).toEqual(["a", "b", "c"]);
  });

  test("empty when no neighboring plans exist", () => {
    expect(recentIdsFor("2026-07-14", new Map())).toEqual([]);
  });

  test("threading a batch avoids consecutive-day repeats when alternatives exist", () => {
    // simulate the week loop: each day picks the first id not used yesterday
    const catalog = ["m1", "m2", "m3"];
    const plansByDate = new Map<string, MealPlanEntry[]>();
    for (const date of weekDates("2026-07-14")) {
      const recent = new Set(recentIdsFor(date, plansByDate));
      const pick = catalog.find((id) => !recent.has(id))!;
      plansByDate.set(date, [entry(pick)]);
    }
    const picks = weekDates("2026-07-14").map((d) => plansByDate.get(d)![0].meal_id);
    for (let i = 1; i < picks.length; i++) {
      expect(picks[i]).not.toBe(picks[i - 1]);
    }
  });
});
