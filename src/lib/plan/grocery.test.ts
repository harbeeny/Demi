import { describe, expect, test } from "bun:test";

import {
  AISLE_ORDER,
  formatQty,
  listHash,
  rollupGroceries,
  type Ingredient,
} from "./grocery";

const ing = (item: string, qty: number, unit: Ingredient["unit"], aisle: Ingredient["aisle"]): Ingredient => ({
  item,
  qty,
  unit,
  aisle,
});

describe("rollupGroceries", () => {
  test("sums the same item across meals", () => {
    const sections = rollupGroceries([
      { ingredients: [ing("chicken breast", 150, "g", "meat & seafood")], servings: 1 },
      { ingredients: [ing("chicken breast", 120, "g", "meat & seafood")], servings: 1 },
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0].lines[0].qty).toBe(270);
    // 270 g of a by-the-pound item rounds up to the next quarter pound
    expect(sections[0].lines[0].display).toBe("¾ lb");
    expect(sections[0].lines[0].buyQty).toBeGreaterThanOrEqual(270);
  });

  test("scales by servings", () => {
    const sections = rollupGroceries([
      { ingredients: [ing("egg", 2, "count", "dairy & eggs")], servings: 2 },
    ]);
    expect(sections[0].lines[0].qty).toBe(4);
  });

  test("mismatched units for one item become two lines, never a sum", () => {
    const sections = rollupGroceries([
      { ingredients: [ing("spinach", 60, "g", "produce")], servings: 1 },
      { ingredients: [ing("spinach", 1, "cup", "produce")], servings: 1 },
    ]);
    expect(sections[0].lines).toHaveLength(2);
  });

  test("groups by aisle in store-walk order, omitting empty aisles", () => {
    const sections = rollupGroceries([
      {
        ingredients: [
          ing("oats", 50, "g", "pantry"),
          ing("banana", 1, "count", "produce"),
          ing("greek yogurt", 170, "g", "dairy & eggs"),
        ],
        servings: 1,
      },
    ]);
    expect(sections.map((s) => s.aisle)).toEqual(["produce", "dairy & eggs", "pantry"]);
    expect(AISLE_ORDER.indexOf(sections[0].aisle)).toBeLessThan(AISLE_ORDER.indexOf(sections[1].aisle));
  });

  test("lines sort alphabetically within an aisle", () => {
    const sections = rollupGroceries([
      {
        ingredients: [
          ing("zucchini", 1, "count", "produce"),
          ing("avocado", 1, "count", "produce"),
        ],
        servings: 1,
      },
    ]);
    expect(sections[0].lines.map((l) => l.item)).toEqual(["avocado", "zucchini"]);
  });
});

describe("formatQty", () => {
  test("grams and ml round to nearest 5", () => {
    expect(formatQty(173, "g")).toBe("175 g");
    expect(formatQty(2, "ml")).toBe("5 ml");
  });

  test("counts round to nearest half with fraction glyphs", () => {
    expect(formatQty(1.5, "count")).toBe("1½");
    expect(formatQty(2.2, "count")).toBe("2");
  });

  test("volume units render mixed quarter fractions", () => {
    expect(formatQty(0.83, "cup")).toBe("¾ cup");
    expect(formatQty(1.5, "tbsp")).toBe("1½ tbsp");
    expect(formatQty(0.05, "tsp")).toBe("¼ tsp");
  });
});

describe("listHash", () => {
  const a = rollupGroceries([
    { ingredients: [ing("oats", 50, "g", "pantry"), ing("banana", 1, "count", "produce")], servings: 1 },
  ]);

  test("stable under input order permutation", () => {
    const b = rollupGroceries([
      { ingredients: [ing("banana", 1, "count", "produce"), ing("oats", 50, "g", "pantry")], servings: 1 },
    ]);
    expect(listHash(a)).toBe(listHash(b));
  });

  test("changes when a quantity changes", () => {
    const b = rollupGroceries([
      { ingredients: [ing("oats", 100, "g", "pantry"), ing("banana", 1, "count", "produce")], servings: 1 },
    ]);
    expect(listHash(a)).not.toBe(listHash(b));
  });
});
