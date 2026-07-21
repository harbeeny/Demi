import { describe, expect, test } from "bun:test";

import { RECIPE_SEED } from "./recipes.seed";
import { STORE_PACKS } from "./packs";
import { applyPantry, rollupGroceries, storeAmount, storeRemaining, type Ingredient } from "./grocery";

describe("STORE_PACKS coverage", () => {
  test("every seed ingredient has a pack entry in its catalog unit", () => {
    const seedIngredients = Object.values(RECIPE_SEED).flatMap((r) => r.ingredients);
    const missing = new Set<string>();
    const mismatched = new Set<string>();
    for (const ing of seedIngredients) {
      const info = STORE_PACKS[ing.item];
      if (!info) missing.add(ing.item);
      else if (info.unit !== ing.unit) mismatched.add(`${ing.item}: pack ${info.unit} vs seed ${ing.unit}`);
    }
    expect([...missing]).toEqual([]);
    expect([...mismatched]).toEqual([]);
  });

  test("pack sizes and piece weights are positive", () => {
    for (const [item, info] of Object.entries(STORE_PACKS)) {
      if (info.def.kind === "pack") expect(info.def.size, item).toBeGreaterThan(0);
      if (info.def.kind === "each" && info.def.grams !== undefined)
        expect(info.def.grams, item).toBeGreaterThan(0);
    }
  });
});

describe("storeAmount", () => {
  test("weighed meat rounds up to quarter pounds", () => {
    expect(storeAmount("chicken breast", 580, "g").label).toBe("1½ lb");
    expect(storeAmount("ground beef", 454, "g").label).toBe("1 lb");
  });

  test("small weighed amounts show ounces", () => {
    expect(storeAmount("deli turkey", 100, "g").label).toBe("4 oz");
  });

  test("purchases cover the need (within the 2% package slack)", () => {
    for (const [item, qty, unit] of [
      ["chicken breast", 580, "g"],
      ["couscous", 300, "g"],
      ["onion", 180, "g"],
      ["egg", 13, "count"],
      ["olive oil", 5.5, "tbsp"],
      ["ground beef", 454, "g"],
    ] as Array<[string, number, Ingredient["unit"]]>) {
      expect(storeAmount(item, qty, unit).buyQty).toBeGreaterThanOrEqual(qty * 0.98);
    }
  });

  test("packaged goods round up to whole packages", () => {
    expect(storeAmount("couscous", 120, "g").label).toBe("1 box (10 oz)");
    expect(storeAmount("couscous", 300, "g").label).toBe("2 boxes (10 oz)");
    expect(storeAmount("black beans", 400, "g").label).toBe("2 cans (15 oz)");
  });

  test("produce sold by the piece rounds up to whole pieces", () => {
    expect(storeAmount("onion", 180, "g").label).toBe("2");
    expect(storeAmount("broccoli", 400, "g").label).toBe("2 heads");
    expect(storeAmount("avocado", 1.75, "count").label).toBe("2");
    expect(storeAmount("garlic", 7, "count").label).toBe("1 head");
  });

  test("eggs come in half-dozen steps labeled as dozens", () => {
    expect(storeAmount("egg", 5, "count").label).toBe("½ dozen");
    expect(storeAmount("egg", 13, "count").label).toBe("1½ dozen");
  });

  test("unknown items and unit mismatches fall back to catalog units", () => {
    expect(storeAmount("dragonfruit", 120, "g").label).toBe("120 g");
    expect(storeAmount("couscous", 1, "cup").label).toBe("1 cup");
  });
});

describe("storeRemaining", () => {
  test("rounds down so it never overpromises", () => {
    expect(storeRemaining("couscous", 160, "g")).toBe("½ box");
    expect(storeRemaining("chicken breast", 500, "g")).toBe("1 lb");
    expect(storeRemaining("egg", 9, "count")).toBe("¾ dozen");
  });

  test("sub-piece and sub-quarter amounts read as \"some\"", () => {
    expect(storeRemaining("onion", 50, "g")).toBe("some");
    expect(storeRemaining("couscous", 40, "g")).toBe("some");
  });
});

const ing = (item: string, qty: number, unit: Ingredient["unit"], aisle: Ingredient["aisle"]): Ingredient => ({
  item,
  qty,
  unit,
  aisle,
});

describe("applyPantry", () => {
  const sections = rollupGroceries([
    {
      ingredients: [
        ing("couscous", 120, "g", "grains & bread"),
        ing("chicken breast", 400, "g", "meat & seafood"),
        ing("onion", 100, "g", "produce"),
      ],
      servings: 1,
    },
  ]);

  test("fully covered lines move to the covered list with a remainder label", () => {
    const { toBuy, covered } = applyPantry(
      sections,
      new Map([["couscous|g", 160]]),
    );
    expect(covered).toEqual([{ item: "couscous", unit: "g", have: 160, display: "½ box" }]);
    expect(toBuy.flatMap((s) => s.lines.map((l) => l.item))).toEqual(["onion", "chicken breast"]);
  });

  test("partial coverage shrinks the amount to buy", () => {
    const { toBuy, covered } = applyPantry(
      sections,
      new Map([["chicken breast|g", 200]]),
    );
    expect(covered).toEqual([]);
    const line = toBuy.flatMap((s) => s.lines).find((l) => l.item === "chicken breast");
    expect(line?.qty).toBe(200);
    expect(line?.display).toBe("8 oz");
  });

  test("an empty pantry changes nothing", () => {
    const { toBuy, covered } = applyPantry(sections, new Map());
    expect(covered).toEqual([]);
    expect(toBuy).toEqual(sections);
  });
});
