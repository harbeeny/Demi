import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { isEligible, selectMeals, type Meal, type SelectionPrefs } from "./select-meals";
import { SLOT_SEQUENCES } from "@/lib/nutrition";
import type { SlotTarget } from "@/lib/nutrition";
import type { MealSlot } from "@/lib/supabase/types";

/**
 * Coverage audit: rebuilds the seeded meals table from the SQL migrations and
 * asserts every restrictive profile can fill a full day. Keeps future seed
 * edits honest — if a migration drops coverage, this fails before production.
 */

const MIGRATIONS_DIR = join(import.meta.dir, "../../../supabase/migrations");

const ROW_RE =
  /\('([^']+)',\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*'\{([^}]*)\}',\s*'([^']*)'\)/g;
const UPDATE_RE =
  /update public\.meals set tags = array_append\(tags, '([^']+)'\) where name = '([^']+)'/g;

function loadSeededMeals(): Meal[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const byName = new Map<string, Meal>();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");

    for (const block of sql.match(/insert into public\.meals[\s\S]*?;/g) ?? []) {
      for (const m of block.matchAll(ROW_RE)) {
        const [, name, kcal, protein, carbs, fat, fiber, tags, source] = m;
        byName.set(name, {
          id: name,
          name,
          kcal: Number(kcal),
          protein_g: Number(protein),
          carbs_g: Number(carbs),
          fat_g: Number(fat),
          fiber_g: Number(fiber),
          tags: tags.split(","),
          source,
        });
      }
    }

    for (const m of sql.matchAll(UPDATE_RE)) {
      const [, tag, name] = m;
      const existing = byName.get(name);
      if (existing && !existing.tags.includes(tag)) existing.tags.push(tag);
    }
  }
  return [...byName.values()];
}

const meals = loadSeededMeals();

const DIETARY_PREFS = ["vegetarian", "vegan", "pescatarian", "gluten_free"] as const;
const BUDGETS = ["low", "medium", "high"] as const;
const SKILLS = ["minimal", "basic", "confident"] as const;
const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_COUNTS = Object.keys(SLOT_SEQUENCES).map(Number);

function prefsFor(pref: string, budget: SelectionPrefs["budget"], skill: SelectionPrefs["cookingSkill"] = "confident"): SelectionPrefs {
  return { dietaryPrefs: [pref], allergies: [], dislikes: [], budget, cookingSkill: skill };
}

function targetsFor(mealsPerDay: number): SlotTarget[] {
  return SLOT_SEQUENCES[mealsPerDay].map((s, i) => ({
    slot: s,
    timeHour: 8 + i * 3,
    kcal: s === "snack" ? 250 : 500,
    proteinG: s === "snack" ? 15 : 35,
    carbsG: s === "snack" ? 25 : 50,
    fatG: s === "snack" ? 10 : 18,
    reasoning: { rule: "test", inputs: {}, explanation: "" },
  }));
}

describe("seeded meal coverage", () => {
  test("seed migrations parse into the expected meal set", () => {
    expect(meals.length).toBeGreaterThanOrEqual(53);
    // Spot-check the retag pass applied.
    const yogurt = meals.find((m) => m.name === "Greek yogurt with berries and honey");
    expect(yogurt?.tags).toContain("gluten_free");
  });

  for (const pref of DIETARY_PREFS) {
    for (const budget of BUDGETS) {
      test(`${pref} x ${budget}: enough distinct meals for every meals_per_day`, () => {
        const eligible = meals.filter((m) => isEligible(m, prefsFor(pref, budget)));
        for (const count of MEAL_COUNTS) {
          expect(eligible.length).toBeGreaterThanOrEqual(SLOT_SEQUENCES[count].length);
        }
      });
    }
  }

  for (const pref of DIETARY_PREFS) {
    test(`${pref}: at least 2 slot-tagged options per slot`, () => {
      const eligible = meals.filter((m) => isEligible(m, prefsFor(pref, "high")));
      for (const s of SLOTS) {
        const tagged = eligible.filter((m) => m.tags.includes(s));
        expect(tagged.length).toBeGreaterThanOrEqual(2);
      }
    });
  }

  test("selectMeals never throws for any pref x budget x skill x meals_per_day", () => {
    for (const pref of DIETARY_PREFS) {
      for (const budget of BUDGETS) {
        for (const skill of SKILLS) {
          for (const count of MEAL_COUNTS) {
            const picked = selectMeals(meals, targetsFor(count), prefsFor(pref, budget, skill));
            expect(picked).toHaveLength(SLOT_SEQUENCES[count].length);
          }
        }
      }
    }
  });
});
