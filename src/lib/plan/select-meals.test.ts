import { describe, expect, test } from "bun:test";

import { isEligible, scoreMeal, selectMeals, type Meal, type SelectionPrefs } from "./select-meals";
import type { SlotTarget } from "@/lib/nutrition";

function meal(overrides: Partial<Meal> & { id: string; name: string }): Meal {
  return {
    kcal: 400,
    protein_g: 30,
    carbs_g: 40,
    fat_g: 12,
    fiber_g: 5,
    tags: [],
    source: "test",
    ingredients: [],
    instructions: [],
    prep_min: 10,
    cook_min: 10,
    ...overrides,
  };
}

const openPrefs: SelectionPrefs = {
  dietaryPrefs: [],
  allergies: [],
  dislikes: [],
  budget: "high",
  cookingSkill: "confident",
};

function slot(overrides: Partial<SlotTarget> = {}): SlotTarget {
  return {
    slot: "lunch",
    timeHour: 13,
    kcal: 500,
    proteinG: 40,
    carbsG: 50,
    fatG: 15,
    reasoning: { rule: "test", inputs: {}, explanation: "" },
    ...overrides,
  };
}

describe("isEligible", () => {
  test("dietary pref must be present as a tag", () => {
    const veg = meal({ id: "1", name: "Tofu bowl", tags: ["lunch", "vegetarian"] });
    const chicken = meal({ id: "2", name: "Chicken bowl", tags: ["lunch"] });
    const prefs = { ...openPrefs, dietaryPrefs: ["vegetarian"] };
    expect(isEligible(veg, prefs)).toBe(true);
    expect(isEligible(chicken, prefs)).toBe(false);
  });

  test("allergen match in name or tags excludes the meal", () => {
    const pb = meal({ id: "1", name: "Oatmeal with peanut butter", tags: ["breakfast"] });
    expect(isEligible(pb, { ...openPrefs, allergies: ["peanut"] })).toBe(false);
    expect(isEligible(pb, { ...openPrefs, allergies: ["shellfish"] })).toBe(true);
  });

  test("dislikes exclude by name substring", () => {
    const eggs = meal({ id: "1", name: "Scrambled eggs on toast", tags: ["breakfast"] });
    expect(isEligible(eggs, { ...openPrefs, dislikes: ["eggs"] })).toBe(false);
  });

  test("diet hierarchy: pescatarian accepts vegetarian and vegan meals", () => {
    const fish = meal({ id: "1", name: "Salmon plate", tags: ["dinner", "pescatarian"] });
    const veg = meal({ id: "2", name: "Halloumi bowl", tags: ["dinner", "vegetarian"] });
    const vegan = meal({ id: "3", name: "Tofu curry", tags: ["dinner", "vegan", "vegetarian"] });
    const omnivore = meal({ id: "4", name: "Steak", tags: ["dinner"] });
    const prefs = { ...openPrefs, dietaryPrefs: ["pescatarian"] };
    expect(isEligible(fish, prefs)).toBe(true);
    expect(isEligible(veg, prefs)).toBe(true);
    expect(isEligible(vegan, prefs)).toBe(true);
    expect(isEligible(omnivore, prefs)).toBe(false);
  });

  test("diet hierarchy: vegetarian accepts vegan meals but not the reverse", () => {
    const veganMeal = meal({ id: "1", name: "Lentil soup", tags: ["lunch", "vegan"] });
    const vegMeal = meal({ id: "2", name: "Egg salad", tags: ["lunch", "vegetarian"] });
    expect(isEligible(veganMeal, { ...openPrefs, dietaryPrefs: ["vegetarian"] })).toBe(true);
    expect(isEligible(vegMeal, { ...openPrefs, dietaryPrefs: ["vegan"] })).toBe(false);
  });

  test("gluten_free stays exact-match", () => {
    const untagged = meal({ id: "1", name: "Quinoa bowl", tags: ["lunch", "vegan"] });
    expect(isEligible(untagged, { ...openPrefs, dietaryPrefs: ["gluten_free"] })).toBe(false);
  });

  test("budget and skill ceilings are respected", () => {
    const fancy = meal({ id: "1", name: "Salmon", tags: ["dinner", "high", "confident"] });
    expect(isEligible(fancy, { ...openPrefs, budget: "low" })).toBe(false);
    expect(isEligible(fancy, { ...openPrefs, cookingSkill: "minimal" })).toBe(false);
    expect(isEligible(fancy, openPrefs)).toBe(true);
  });
});

describe("scoreMeal", () => {
  test("closer macro fit scores lower", () => {
    const t = slot();
    const close = meal({ id: "1", name: "a", kcal: 500, protein_g: 40, carbs_g: 50, fat_g: 15 });
    const far = meal({ id: "2", name: "b", kcal: 300, protein_g: 10, carbs_g: 20, fat_g: 5 });
    expect(scoreMeal(close, t)).toBeLessThan(scoreMeal(far, t));
  });

  test("protein misses are weighted heavier than carb misses", () => {
    const t = slot();
    const lowProtein = meal({ id: "1", name: "a", kcal: 500, protein_g: 20, carbs_g: 50, fat_g: 15 });
    const lowCarb = meal({ id: "2", name: "b", kcal: 500, protein_g: 40, carbs_g: 25, fat_g: 15 });
    expect(scoreMeal(lowCarb, t)).toBeLessThan(scoreMeal(lowProtein, t));
  });
});

describe("selectMeals", () => {
  const db: Meal[] = [
    meal({ id: "b1", name: "Yogurt bowl", tags: ["breakfast"], kcal: 320, protein_g: 22 }),
    meal({ id: "b2", name: "Oatmeal", tags: ["breakfast"], kcal: 420, protein_g: 14 }),
    meal({ id: "l1", name: "Chicken salad", tags: ["lunch"], kcal: 420, protein_g: 38 }),
    meal({ id: "l2", name: "Turkey wrap", tags: ["lunch"], kcal: 480, protein_g: 32 }),
    meal({ id: "d1", name: "Salmon plate", tags: ["dinner"], kcal: 560, protein_g: 40 }),
    meal({ id: "d2", name: "Stir-fry", tags: ["dinner"], kcal: 540, protein_g: 38 }),
  ];

  const threeSlots: SlotTarget[] = [
    slot({ slot: "breakfast", timeHour: 8, kcal: 400, proteinG: 30 }),
    slot({ slot: "lunch", timeHour: 14, kcal: 500, proteinG: 40 }),
    slot({ slot: "dinner", timeHour: 20, kcal: 600, proteinG: 45 }),
  ];

  test("fills each slot with a slot-tagged meal", () => {
    const picked = selectMeals(db, threeSlots, openPrefs);
    expect(picked).toHaveLength(3);
    expect(picked[0].meal.tags).toContain("breakfast");
    expect(picked[1].meal.tags).toContain("lunch");
    expect(picked[2].meal.tags).toContain("dinner");
  });

  test("never repeats a meal within a day when enough options exist", () => {
    const picked = selectMeals(db, threeSlots, openPrefs);
    const ids = picked.map((p) => p.meal.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(picked.every((p) => !p.reused)).toBe(true);
  });

  test("reuses a meal instead of throwing when eligible meals run out", () => {
    const tiny = [
      meal({ id: "l1", name: "Chicken salad", tags: ["lunch"] }),
      meal({ id: "d1", name: "Salmon plate", tags: ["dinner"] }),
    ];
    const fourSlots: SlotTarget[] = [
      slot({ slot: "breakfast", timeHour: 8 }),
      slot({ slot: "lunch", timeHour: 12 }),
      slot({ slot: "snack", timeHour: 16 }),
      slot({ slot: "dinner", timeHour: 20 }),
    ];
    const picked = selectMeals(tiny, fourSlots, openPrefs);
    expect(picked).toHaveLength(4);
    // Distinct meals are used before any repeat.
    expect(new Set(picked.slice(0, 2).map((p) => p.meal.id)).size).toBe(2);
    // Repeats are flagged.
    expect(picked.filter((p) => p.reused)).toHaveLength(2);
  });

  test("prefers a distinct off-slot meal over repeating a slot-tagged one", () => {
    const meals = [
      meal({ id: "l1", name: "Chicken salad", tags: ["lunch"] }),
      meal({ id: "d1", name: "Salmon plate", tags: ["dinner"] }),
    ];
    const twoLunches: SlotTarget[] = [
      slot({ slot: "lunch", timeHour: 12 }),
      slot({ slot: "lunch", timeHour: 15 }),
    ];
    const picked = selectMeals(meals, twoLunches, openPrefs);
    expect(picked.map((p) => p.meal.id).sort()).toEqual(["d1", "l1"]);
    expect(picked.every((p) => !p.reused)).toBe(true);
  });

  test("variety penalty steers away from recently used meals", () => {
    const first = selectMeals(db, threeSlots, openPrefs);
    const second = selectMeals(db, threeSlots, openPrefs, first.map((p) => p.meal.id));
    // With two options per slot, penalized picks should flip.
    expect(second.map((p) => p.meal.id)).not.toEqual(first.map((p) => p.meal.id));
  });

  test("throws a clear error when filters eliminate everything", () => {
    expect(() =>
      selectMeals(db, threeSlots, { ...openPrefs, dietaryPrefs: ["vegan"] }),
    ).toThrow(/No meals match/);
  });

  test("hard filters are never violated even if fit suffers", () => {
    const prefs = { ...openPrefs, dislikes: ["chicken", "turkey"] };
    const picked = selectMeals(db, threeSlots, prefs);
    for (const p of picked) {
      expect(p.meal.name.toLowerCase()).not.toContain("chicken");
      expect(p.meal.name.toLowerCase()).not.toContain("turkey");
    }
  });
});
