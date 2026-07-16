import { describe, expect, test } from "bun:test";

import { normalizeOffProduct, type OffProduct } from "./off";
import { barcodeVariants } from "./fdc";

// Trimmed from the live OFF response for Nutella (3017620422003).
const nutella: OffProduct = {
  product_name: "Nutella",
  brands: "Nutella, Ferrero, Yum yum",
  serving_quantity: 15,
  serving_size: "1 tbsp (15 g)",
  nutriments: {
    "energy-kcal_100g": 539,
    "energy-kj_100g": 2252,
    proteins_100g: 6.3,
    carbohydrates_100g: 57.5,
    fat_100g: 30.9,
  },
};

describe("normalizeOffProduct", () => {
  test("maps per-100g macros, first brand, serving chip, and the 100 g chip", () => {
    const food = normalizeOffProduct(nutella, "3017620422003")!;
    expect(food.description).toBe("Nutella");
    expect(food.brand).toBe("Nutella");
    expect(food.dataType).toBe("Open Food Facts");
    expect(food.gtinUpc).toBe("3017620422003");
    expect(food.per100g).toEqual({ kcal: 539, proteinG: 6.3, carbsG: 57.5, fatG: 30.9 });
    expect(food.portions[0]).toEqual({ label: "1 tbsp (15 g)", gramWeight: 15 });
    expect(food.portions).toContainEqual({ label: "100 g", gramWeight: 100 });
    expect(food.fdcId).toBe(0);
  });

  test("liquids mark displayUnit ml with ml portion labels", () => {
    const cola: OffProduct = {
      product_name: "Coca-Cola",
      serving_quantity: 330,
      serving_quantity_unit: "ml",
      serving_size: "1 portion (330 ml)",
      nutriments: { "energy-kcal_100g": 42, proteins_100g: 0, carbohydrates_100g: 10.6, fat_100g: 0 },
    };
    const food = normalizeOffProduct(cola, "5449000000996")!;
    expect(food.displayUnit).toBe("ml");
    expect(food.portions[0]).toEqual({ label: "1 portion (330 ml)", gramWeight: 330 });
    expect(food.portions).toContainEqual({ label: "100 ml", gramWeight: 100 });
  });

  test("zero-calorie liquids normalize with kcal 0", () => {
    const dietSoda: OffProduct = {
      product_name: "Zero Sugar",
      brands: "Dr Pepper",
      serving_quantity: 355,
      serving_quantity_unit: "ml",
      nutriments: { "energy-kcal_100g": 0, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 0 },
    };
    const food = normalizeOffProduct(dietSoda, "078000082166")!;
    expect(food.per100g.kcal).toBe(0);
    expect(food.displayUnit).toBe("ml");
  });

  test("kJ-only energy converts to kcal", () => {
    const kj: OffProduct = {
      product_name: "Test bar",
      nutriments: { "energy-kj_100g": 418.4, proteins_100g: 10, carbohydrates_100g: 5, fat_100g: 2 },
    };
    expect(normalizeOffProduct(kj, "123")!.per100g.kcal).toBeCloseTo(100, 1);
  });

  test("computes 4/4/9 when no energy fields exist", () => {
    const bare: OffProduct = {
      product_name: "Macro only",
      nutriments: { proteins_100g: 10, carbohydrates_100g: 5, fat_100g: 2 },
    };
    expect(normalizeOffProduct(bare, "123")!.per100g.kcal).toBe(78);
  });

  test("rejects products without a name or without any nutrition", () => {
    expect(normalizeOffProduct({ nutriments: { proteins_100g: 5 } }, "1")).toBeNull();
    expect(normalizeOffProduct({ product_name: "Ghost" }, "1")).toBeNull();
  });
});

describe("barcodeVariants", () => {
  test("probes the scanned form plus stripped and padded forms", () => {
    // UPC-A scan of a product FDC stores as 14 digits
    expect(barcodeVariants("016000275287")).toEqual([
      "016000275287",
      "16000275287",
      "016000275287".padStart(12, "0") === "016000275287" ? "016000275287" : "",
      "0016000275287",
      "00016000275287",
    ].filter((v, i, a) => v && a.indexOf(v) === i));
  });

  test("13-digit EAN scan reaches the 12-digit stored form", () => {
    expect(barcodeVariants("0022000135049")).toContain("022000135049");
  });

  test("short Trader Joe's store codes survive as-is", () => {
    expect(barcodeVariants("00505000")).toContain("00505000");
  });

  test("garbage yields nothing", () => {
    expect(barcodeVariants("0000")).toEqual([]);
  });
});
