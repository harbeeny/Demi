// Open Food Facts fallback for barcode scans that miss USDA. Crowdsourced
// label data (ODbL, attributed in the sheet footer), normalized to the same
// FdcFood shape so the UI needs no second code path. Pure and client-safe;
// the fetch itself lives in the search route.

import { titleCaseIfShouting, type FdcFood, type FdcPortion } from "./fdc";

export interface OffProduct {
  product_name?: string;
  brands?: string;
  serving_quantity?: number | string;
  serving_size?: string;
  nutriments?: Record<string, number | string | undefined>;
}

const KJ_PER_KCAL = 4.184;

function num(v: number | string | undefined): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/**
 * Normalize an OFF product into the app's food shape, or null when it lacks
 * usable macros. Macros are per 100 g like FDC search hits; kcal falls back
 * from the kcal field to kJ, then to computed 4/4/9.
 */
export function normalizeOffProduct(product: OffProduct, barcode: string): FdcFood | null {
  const n = product.nutriments ?? {};
  const proteinG = num(n["proteins_100g"]) ?? 0;
  const carbsG = num(n["carbohydrates_100g"]) ?? 0;
  const fatG = num(n["fat_100g"]) ?? 0;

  let kcal = num(n["energy-kcal_100g"]);
  if (kcal === null) {
    const kj = num(n["energy-kj_100g"]) ?? num(n["energy_100g"]);
    if (kj !== null) kcal = kj / KJ_PER_KCAL;
  }
  if (kcal === null) {
    if (proteinG === 0 && carbsG === 0 && fatG === 0) return null;
    kcal = proteinG * 4 + carbsG * 4 + fatG * 9;
  }
  if (!Number.isFinite(kcal) || kcal < 0) return null;

  const name = product.product_name?.trim();
  if (!name) return null;

  const portions: FdcPortion[] = [];
  const servingG = num(product.serving_quantity);
  if (servingG !== null && servingG > 0) {
    const grams = `${Math.round(servingG)} g`;
    const text = product.serving_size?.trim();
    const label =
      text && text.length <= 30
        ? text.includes(grams)
          ? text
          : `${text} (${grams})`
        : `1 serving (${grams})`;
    portions.push({ label, gramWeight: servingG });
  }
  if (!portions.some((p) => Math.abs(p.gramWeight - 100) < 0.01)) {
    portions.push({ label: "100 g", gramWeight: 100 });
  }

  return {
    fdcId: 0,
    description: titleCaseIfShouting(name),
    brand: product.brands?.split(",")[0]?.trim() || null,
    dataType: "Open Food Facts",
    gtinUpc: barcode,
    per100g: {
      kcal: Math.round(kcal * 10) / 10,
      proteinG: Math.round(proteinG * 10) / 10,
      carbsG: Math.round(carbsG * 10) / 10,
      fatG: Math.round(fatG * 10) / 10,
    },
    portions: portions.slice(0, 6),
  };
}
