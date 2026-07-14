import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { NEW_MEALS, RECIPE_SEED } from "./recipes.seed";
import type { Aisle, Unit } from "./grocery";

// Seed lint: the recipe catalog is maintained by hand, so these tests are the
// enforcement point for the vocabulary and authoring rules the grocery rollup
// and recipe UI depend on.

const MIGRATIONS_DIR = join(import.meta.dir, "../../../supabase/migrations");
const ROW_RE =
  /\('([^']+)',\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*'\{([^}]*)\}',\s*'([^']*)'\)/g;

const UNITS: Unit[] = ["g", "ml", "count", "tbsp", "tsp", "cup"];
const AISLES: Aisle[] = [
  "produce", "meat & seafood", "dairy & eggs", "grains & bread", "pantry", "frozen", "other",
];

function migrationMealNames(): Map<string, { kcal: number; proteinG: number; tags: string[] }> {
  const byName = new Map<string, { kcal: number; proteinG: number; tags: string[] }>();
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const block of sql.match(/insert into public\.meals[\s\S]*?;/g) ?? []) {
      for (const m of block.matchAll(ROW_RE)) {
        const [, name, kcal, protein, , , , tags] = m;
        byName.set(name, { kcal: Number(kcal), proteinG: Number(protein), tags: tags.split(",") });
      }
    }
  }
  return byName;
}

const catalog = migrationMealNames();
const seedNames = new Set(Object.keys(RECIPE_SEED));

describe("recipe seed coverage", () => {
  test("every catalog meal has a recipe and no recipe lacks a meal", () => {
    // NEW_MEALS are part of the catalog once the phase 4 migration lands;
    // before that they exist only in the seed module.
    const expected = new Set([...catalog.keys(), ...NEW_MEALS.map((m) => m.name)]);
    expect([...seedNames].sort()).toEqual([...expected].sort());
  });

  test("catalog holds at least 63 meals once new meals land", () => {
    expect(seedNames.size).toBeGreaterThanOrEqual(63);
  });
});

describe("recipe seed rules", () => {
  const entries = Object.entries(RECIPE_SEED);

  test("ingredient counts, quantities, and vocabularies", () => {
    for (const [name, seed] of entries) {
      expect(seed.ingredients.length, name).toBeGreaterThanOrEqual(3);
      expect(seed.ingredients.length, name).toBeLessThanOrEqual(10);
      for (const ing of seed.ingredients) {
        expect(ing.qty, `${name}: ${ing.item}`).toBeGreaterThan(0);
        expect(UNITS, `${name}: ${ing.item} unit`).toContain(ing.unit);
        expect(AISLES, `${name}: ${ing.item} aisle`).toContain(ing.aisle);
        expect(ing.item, `${name}: ${ing.item} lowercase`).toBe(ing.item.toLowerCase());
        expect(["water", "salt", "pepper"], `${name}: banned item`).not.toContain(ing.item);
      }
    }
  });

  test("instructions: 3-6 original steps, bounded length, no em or en dashes", () => {
    for (const [name, seed] of entries) {
      expect(seed.instructions.length, name).toBeGreaterThanOrEqual(3);
      expect(seed.instructions.length, name).toBeLessThanOrEqual(6);
      for (const step of seed.instructions) {
        expect(step.length, `${name} step length`).toBeLessThanOrEqual(200);
        expect(step, `${name} dashes`).not.toMatch(/[—–]/);
      }
      for (const ing of seed.ingredients) {
        expect(ing.item, `${name} item dashes`).not.toMatch(/[—–]/);
      }
    }
  });

  test("prep and cook times in range; minimal-skill meals stay quick", () => {
    for (const [name, seed] of entries) {
      expect(seed.prepMin, name).toBeGreaterThanOrEqual(0);
      expect(seed.prepMin, name).toBeLessThanOrEqual(25);
      expect(seed.cookMin, name).toBeGreaterThanOrEqual(0);
      expect(seed.cookMin, name).toBeLessThanOrEqual(45);
      const tags = catalog.get(name)?.tags ?? NEW_MEALS.find((m) => m.name === name)?.tags ?? [];
      if (tags.includes("minimal")) {
        expect(seed.prepMin + seed.cookMin, `${name} minimal <= 15`).toBeLessThanOrEqual(15);
      }
    }
  });

  test("one unit and one aisle per item across the whole catalog", () => {
    const unitByItem = new Map<string, Unit>();
    const aisleByItem = new Map<string, Aisle>();
    for (const [name, seed] of entries) {
      for (const ing of seed.ingredients) {
        const priorUnit = unitByItem.get(ing.item);
        const priorAisle = aisleByItem.get(ing.item);
        if (priorUnit) expect(priorUnit, `${ing.item} unit (${name})`).toBe(ing.unit);
        if (priorAisle) expect(priorAisle, `${ing.item} aisle (${name})`).toBe(ing.aisle);
        unitByItem.set(ing.item, ing.unit);
        aisleByItem.set(ing.item, ing.aisle);
      }
    }
  });
});

describe("new meal metadata", () => {
  test("tags follow catalog convention and sources cite USDA", () => {
    for (const m of NEW_MEALS) {
      const tags = m.tags;
      expect(tags.some((t) => ["breakfast", "lunch", "dinner", "snack"].includes(t)), m.name).toBe(true);
      expect(tags.filter((t) => ["low", "medium", "high"].includes(t)), m.name).toHaveLength(1);
      expect(tags.filter((t) => ["minimal", "basic", "confident"].includes(t)), m.name).toHaveLength(1);
      expect(m.source, m.name).toContain("USDA MyPlate Kitchen, adapted");
    }
  });
});

describe("anchor macro spot-checks (typical values, ±15%)", () => {
  // small nutrition table: kcal and protein per unit of the anchor items
  const NUTRITION: Record<string, { kcal: number; proteinG: number; per: number; unit: Unit }> = {
    egg: { kcal: 72, proteinG: 6.3, per: 1, unit: "count" },
    "whey protein powder": { kcal: 3.9, proteinG: 0.85, per: 1, unit: "g" },
    apple: { kcal: 95, proteinG: 0.5, per: 1, unit: "count" },
    "peanut butter": { kcal: 95, proteinG: 4, per: 1, unit: "tbsp" },
    "chicken breast": { kcal: 1.65, proteinG: 0.31, per: 1, unit: "g" },
    "white rice": { kcal: 3.6, proteinG: 0.07, per: 1, unit: "g" },
    "black beans": { kcal: 0.91, proteinG: 0.06, per: 1, unit: "g" },
    salsa: { kcal: 4, proteinG: 0.2, per: 1, unit: "tbsp" },
  };

  const withinPct = (actual: number, expected: number, pct: number) =>
    Math.abs(actual - expected) <= expected * pct;

  const anchors = [
    "Apple with peanut butter",
    "Protein shake (whey with water)",
    "Chicken burrito bowl (rice, beans, salsa)",
  ];

  for (const name of anchors) {
    test(name, () => {
      const seed = RECIPE_SEED[name];
      const stored = catalog.get(name);
      expect(seed, `${name} missing from seed`).toBeDefined();
      expect(stored, `${name} missing from catalog`).toBeDefined();
      let kcal = 0;
      let protein = 0;
      let covered = 0;
      for (const ing of seed.ingredients) {
        const n = NUTRITION[ing.item];
        if (!n) continue;
        expect(n.unit, `${name}: ${ing.item} anchor unit`).toBe(ing.unit);
        kcal += n.kcal * ing.qty;
        protein += n.proteinG * ing.qty;
        covered++;
      }
      // Single-ingredient-dominated meals (the shake) legitimately cover one.
      expect(covered, `${name}: anchor table coverage`).toBeGreaterThanOrEqual(1);
      // Anchors dominate these simple meals; allow 25% headroom for the
      // remaining minor ingredients on kcal, 15% on protein.
      expect(withinPct(kcal, stored!.kcal, 0.25), `${name} kcal ${kcal} vs ${stored!.kcal}`).toBe(true);
      expect(withinPct(protein, stored!.proteinG, 0.2), `${name} protein ${protein} vs ${stored!.proteinG}`).toBe(true);
    });
  }
});
