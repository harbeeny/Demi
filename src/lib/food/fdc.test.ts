import { describe, expect, test } from "bun:test";

import {
  extractKcal,
  isBarcodeQuery,
  isVerifiedSource,
  matchesBarcode,
  normalizeSearchHit,
  rankResults,
  scaleMacros,
  titleCaseIfShouting,
  type RawSearchHit,
} from "./fdc";

// Fixtures abbreviated from real API responses (July 2026).

const brandedCheddar: RawSearchHit = {
  fdcId: 2057648,
  description: "CHEDDAR CHEESE",
  dataType: "Branded",
  brandOwner: "Grafton Village Cheese Co, LLC",
  brandName: "GRAFTON VILLAGE",
  gtinUpc: "0023627777000",
  servingSize: 28.0,
  servingSizeUnit: "g",
  householdServingFullText: "1 ONZ",
  foodNutrients: [
    { nutrientId: 1008, nutrientNumber: "208", unitName: "KCAL", value: 393 },
    { nutrientId: 1003, nutrientNumber: "203", unitName: "G", value: 21.4 },
    { nutrientId: 1005, nutrientNumber: "205", unitName: "G", value: 3.57 },
    { nutrientId: 1004, nutrientNumber: "204", unitName: "G", value: 32.1 },
  ],
};

// Foundation food WITHOUT nutrient 1008: only the Atwater energies (verified
// live against fdcId 1750340, fuji apple).
const foundationApple: RawSearchHit = {
  fdcId: 1750340,
  description: "Apples, fuji, with skin, raw",
  dataType: "Foundation",
  foodMeasures: [],
  foodNutrients: [
    { nutrientId: 2047, nutrientNumber: "957", unitName: "KCAL", value: 64.66 },
    { nutrientId: 2048, nutrientNumber: "958", unitName: "KCAL", value: 58.2 },
    { nutrientId: 1003, nutrientNumber: "203", unitName: "G", value: 0.15 },
    { nutrientId: 1005, nutrientNumber: "205", unitName: "G", value: 15.7 },
    { nutrientId: 1004, nutrientNumber: "204", unitName: "G", value: 0.16 },
  ],
};

const surveyApple: RawSearchHit = {
  fdcId: 2709215,
  description: "Apple, raw",
  dataType: "Survey (FNDDS)",
  foodMeasures: [
    { disseminationText: "1 slice", gramWeight: 25, rank: 5 },
    { disseminationText: "1 small", gramWeight: 165, rank: 1 },
    { disseminationText: "Quantity not specified", gramWeight: 182, rank: 9 },
  ],
  foodNutrients: [
    { nutrientId: 1008, nutrientNumber: "208", unitName: "KCAL", value: 61 },
    { nutrientId: 1003, nutrientNumber: "203", unitName: "G", value: 0.17 },
    { nutrientId: 1005, nutrientNumber: "205", unitName: "G", value: 14.8 },
    { nutrientId: 1004, nutrientNumber: "204", unitName: "G", value: 0.15 },
  ],
};

const kjOnly: RawSearchHit = {
  fdcId: 999,
  description: "Test food",
  dataType: "SR Legacy",
  foodNutrients: [
    { nutrientId: 1062, nutrientNumber: "268", unitName: "kJ", value: 418.4 },
    { nutrientId: 1003, nutrientNumber: "203", unitName: "G", value: 10 },
    { nutrientId: 1005, nutrientNumber: "205", unitName: "G", value: 5 },
    { nutrientId: 1004, nutrientNumber: "204", unitName: "G", value: 2 },
  ],
};

describe("extractKcal fallback chain", () => {
  test("prefers 1008 when present", () => {
    expect(extractKcal(brandedCheddar.foodNutrients!, { proteinG: 0, carbsG: 0, fatG: 0 })).toBe(393);
  });

  test("falls back to Atwater General when 1008 is missing", () => {
    expect(extractKcal(foundationApple.foodNutrients!, { proteinG: 0, carbsG: 0, fatG: 0 })).toBe(64.66);
  });

  test("converts kJ when only 1062 exists", () => {
    expect(extractKcal(kjOnly.foodNutrients!, { proteinG: 0, carbsG: 0, fatG: 0 })).toBeCloseTo(100, 1);
  });

  test("computes 4/4/9 as the last resort", () => {
    expect(extractKcal([], { proteinG: 10, carbsG: 5, fatG: 2 })).toBe(78);
  });
});

describe("normalizeSearchHit", () => {
  test("Branded: per-100g macros, title-cased text, serving portion + 100 g chip", () => {
    const food = normalizeSearchHit(brandedCheddar)!;
    expect(food.description).toBe("Cheddar Cheese");
    expect(food.brand).toBe("Grafton Village");
    expect(food.per100g.kcal).toBe(393);
    expect(food.per100g.proteinG).toBe(21.4);
    const labels = food.portions.map((p) => p.label);
    expect(labels[0]).toContain("(28 g)");
    expect(labels).toContain("100 g");
  });

  test("Foundation without 1008 still yields kcal via Atwater", () => {
    const food = normalizeSearchHit(foundationApple)!;
    expect(food.per100g.kcal).toBe(64.7);
    expect(food.portions).toEqual([{ label: "100 g", gramWeight: 100 }]);
  });

  test("Survey: household measures sorted by rank, plus the 100 g chip", () => {
    const food = normalizeSearchHit(surveyApple)!;
    expect(food.portions[0]).toEqual({ label: "1 small", gramWeight: 165 });
    expect(food.portions[1]).toEqual({ label: "1 slice", gramWeight: 25 });
    expect(food.portions[2]).toEqual({ label: "100 g", gramWeight: 100 });
    expect(food.portions).toHaveLength(3); // "Quantity not specified" filler dropped
  });

  test("hit with no macro nutrients is dropped", () => {
    expect(normalizeSearchHit({ fdcId: 1, description: "x", dataType: "Branded", foodNutrients: [] })).toBeNull();
  });
});

describe("scaleMacros", () => {
  test("scales per-100g to grams with display rounding", () => {
    expect(scaleMacros({ kcal: 393, proteinG: 21.4, carbsG: 3.57, fatG: 32.1 }, 28)).toEqual({
      kcal: 110,
      proteinG: 6,
      carbsG: 1,
      fatG: 9,
    });
  });
});

describe("rankResults", () => {
  test("curated dataTypes sort above Branded, order otherwise stable", () => {
    const foods = [
      normalizeSearchHit(brandedCheddar)!,
      normalizeSearchHit(surveyApple)!,
      normalizeSearchHit(foundationApple)!,
    ];
    const ranked = rankResults(foods);
    expect(ranked.map((f) => f.dataType)).toEqual(["Survey (FNDDS)", "Foundation", "Branded"]);
  });
});

describe("Branded liquids", () => {
  const zeroSoda: RawSearchHit = {
    fdcId: 999001,
    description: "ZERO SUGAR",
    dataType: "Branded",
    brandOwner: "Dr Pepper",
    gtinUpc: "0078000082401",
    servingSize: 355,
    servingSizeUnit: "MLT",
    householdServingFullText: "1 CAN (355 ML)",
    foodNutrients: [
      { nutrientId: 1008, nutrientNumber: "208", unitName: "KCAL", value: 0 },
      { nutrientId: 1003, nutrientNumber: "203", unitName: "G", value: 0 },
      { nutrientId: 1005, nutrientNumber: "205", unitName: "G", value: 0 },
      { nutrientId: 1004, nutrientNumber: "204", unitName: "G", value: 0 },
    ],
  };

  test("ml servings mark displayUnit and never get a grams suffix", () => {
    const food = normalizeSearchHit(zeroSoda)!;
    expect(food.displayUnit).toBe("ml");
    expect(food.portions[0]).toEqual({ label: "1 Can (355 Ml)", gramWeight: 355 });
    expect(food.portions).toContainEqual({ label: "100 ml", gramWeight: 100 });
    expect(food.per100g.kcal).toBe(0);
  });

  test("gram servings stay unmarked", () => {
    expect(normalizeSearchHit(brandedCheddar)!.displayUnit).toBeUndefined();
  });
});

describe("barcode helpers", () => {
  test("isBarcodeQuery accepts 8-14 digit runs only", () => {
    expect(isBarcodeQuery("038000138416")).toBe(true);
    expect(isBarcodeQuery("0023627777000")).toBe(true);
    expect(isBarcodeQuery("greek yogurt")).toBe(false);
    expect(isBarcodeQuery("1234567")).toBe(false); // too short
    expect(isBarcodeQuery("123456789012345")).toBe(false); // too long
  });

  test("matchesBarcode ignores leading zeros in either direction", () => {
    expect(matchesBarcode("0023627777000", "23627777000")).toBe(true);
    expect(matchesBarcode("038000138416", "0038000138416")).toBe(true);
    expect(matchesBarcode("038000138416", "038000138417")).toBe(false);
    expect(matchesBarcode(null, "038000138416")).toBe(false);
    expect(matchesBarcode("", "038000138416")).toBe(false);
  });

  test("normalizeSearchHit carries the gtinUpc through", () => {
    expect(normalizeSearchHit(brandedCheddar)!.gtinUpc).toBe("0023627777000");
    expect(normalizeSearchHit(surveyApple)!.gtinUpc).toBeNull();
  });
});

describe("isVerifiedSource", () => {
  test("curated USDA sources are verified, Branded is not", () => {
    expect(isVerifiedSource("Foundation")).toBe(true);
    expect(isVerifiedSource("SR Legacy")).toBe(true);
    expect(isVerifiedSource("Survey (FNDDS)")).toBe(true);
    expect(isVerifiedSource("Branded")).toBe(false);
    expect(isVerifiedSource("")).toBe(false);
  });
});

describe("titleCaseIfShouting", () => {
  test("only rewrites all-caps strings", () => {
    expect(titleCaseIfShouting("CHEDDAR CHEESE")).toBe("Cheddar Cheese");
    expect(titleCaseIfShouting("Apples, fuji, with skin, raw")).toBe("Apples, fuji, with skin, raw");
    expect(titleCaseIfShouting("GRAFTON-VILLAGE (VERMONT)")).toBe("Grafton-Village (Vermont)");
  });
});
