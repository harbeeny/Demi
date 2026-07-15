// USDA FoodData Central normalization. Client-safe (types + pure functions);
// the actual API call lives in the /api/food/search route with the key.
//
// Verified facts this module encodes (July 2026, live API):
// - Search foodNutrients are per 100 g for ALL dataTypes, including Branded.
// - Foundation foods often lack nutrient 1008 (Energy kcal) entirely; the
//   fallback chain below is required, not defensive decoration.
// - Search hits can reference detail records that 404, so portions come from
//   the search hit only: Survey has foodMeasures, Branded has servingSize,
//   Foundation/SR get a 100 g default.

export interface FdcMacros {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface FdcPortion {
  label: string;
  gramWeight: number;
}

export interface FdcFood {
  fdcId: number;
  description: string;
  brand: string | null;
  dataType: string;
  /** UPC/EAN digits for Branded foods; null elsewhere */
  gtinUpc: string | null;
  /** always per 100 g */
  per100g: FdcMacros;
  portions: FdcPortion[];
}

interface RawNutrient {
  nutrientId?: number;
  nutrientNumber?: string;
  unitName?: string;
  value?: number;
}

interface RawMeasure {
  disseminationText?: string;
  gramWeight?: number;
  rank?: number;
}

export interface RawSearchHit {
  fdcId: number;
  description: string;
  dataType: string;
  brandOwner?: string;
  brandName?: string;
  gtinUpc?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients?: RawNutrient[];
  foodMeasures?: RawMeasure[];
}

const KJ_PER_KCAL = 4.184;

function nutrient(nutrients: RawNutrient[], id: number, number: string): number | null {
  const hit = nutrients.find((n) => n.nutrientId === id || n.nutrientNumber === number);
  return typeof hit?.value === "number" && Number.isFinite(hit.value) ? hit.value : null;
}

/** kcal per 100 g with the verified fallback chain. */
export function extractKcal(nutrients: RawNutrient[], macros: Omit<FdcMacros, "kcal">): number {
  const direct = nutrient(nutrients, 1008, "208");
  if (direct !== null) return direct;
  const atwaterGeneral = nutrient(nutrients, 2047, "957");
  if (atwaterGeneral !== null) return atwaterGeneral;
  const atwaterSpecific = nutrient(nutrients, 2048, "958");
  if (atwaterSpecific !== null) return atwaterSpecific;
  const kj = nutrient(nutrients, 1062, "268");
  if (kj !== null) return kj / KJ_PER_KCAL;
  return macros.proteinG * 4 + macros.carbsG * 4 + macros.fatG * 9;
}

/** Branded descriptions arrive ALL-CAPS; make them readable. */
export function titleCaseIfShouting(text: string): string {
  if (text !== text.toUpperCase() || !/[A-Z]/.test(text)) return text;
  return text
    .toLowerCase()
    .replace(/(^|[\s\-(/])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Normalize one search hit; null when it has no usable macro data. */
export function normalizeSearchHit(hit: RawSearchHit): FdcFood | null {
  const nutrients = hit.foodNutrients ?? [];
  const proteinG = nutrient(nutrients, 1003, "203");
  const carbsG = nutrient(nutrients, 1005, "205");
  const fatG = nutrient(nutrients, 1004, "204");
  if (proteinG === null && carbsG === null && fatG === null) return null;

  const macrosNoKcal = { proteinG: proteinG ?? 0, carbsG: carbsG ?? 0, fatG: fatG ?? 0 };
  const kcal = extractKcal(nutrients, macrosNoKcal);
  if (!Number.isFinite(kcal) || kcal < 0) return null;

  const isBranded = hit.dataType === "Branded";
  const portions: FdcPortion[] = [];

  // Survey (FNDDS) carries household measures right in the search hit.
  // "Quantity not specified" is FNDDS filler, not a real portion.
  for (const m of [...(hit.foodMeasures ?? [])].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))) {
    if (
      m.disseminationText &&
      typeof m.gramWeight === "number" &&
      m.gramWeight > 0 &&
      !/quantity not specified/i.test(m.disseminationText)
    ) {
      portions.push({ label: m.disseminationText, gramWeight: m.gramWeight });
    }
  }

  // Branded: one serving chip from the label data (household text is often
  // junk like "1 ONZ", so fall back to the gram amount).
  if (isBranded && typeof hit.servingSize === "number" && hit.servingSize > 0) {
    const unit = (hit.servingSizeUnit ?? "g").toLowerCase();
    if (unit === "g" || unit === "grm" || unit === "ml" || unit === "mlt") {
      const text = hit.householdServingFullText?.trim();
      const label =
        text && text.length <= 30
          ? `${titleCaseIfShouting(text)} (${Math.round(hit.servingSize)} g)`
          : `1 serving (${Math.round(hit.servingSize)} g)`;
      portions.push({ label, gramWeight: hit.servingSize });
    }
  }

  // Everything gets a plain 100 g chip so no food is ever gram-less.
  if (!portions.some((p) => Math.abs(p.gramWeight - 100) < 0.01)) {
    portions.push({ label: "100 g", gramWeight: 100 });
  }

  return {
    fdcId: hit.fdcId,
    description: titleCaseIfShouting(hit.description),
    brand: hit.brandName?.trim()
      ? titleCaseIfShouting(hit.brandName.trim())
      : hit.brandOwner?.trim()
        ? titleCaseIfShouting(hit.brandOwner.trim())
        : null,
    dataType: hit.dataType,
    gtinUpc: hit.gtinUpc?.trim() || null,
    per100g: {
      kcal: Math.round(kcal * 10) / 10,
      proteinG: Math.round(macrosNoKcal.proteinG * 10) / 10,
      carbsG: Math.round(macrosNoKcal.carbsG * 10) / 10,
      fatG: Math.round(macrosNoKcal.fatG * 10) / 10,
    },
    portions: portions.slice(0, 6),
  };
}

/** A run of 8-14 digits is a scanned barcode, not a food name. */
export function isBarcodeQuery(q: string): boolean {
  return /^\d{8,14}$/.test(q.trim());
}

/**
 * Compare barcode digit strings ignoring leading zeros: scanners hand back
 * EAN-13 ("0038000138416") where FDC may store the 12-digit UPC-A
 * ("038000138416"), and vice versa.
 */
export function matchesBarcode(gtin: string | null, code: string): boolean {
  if (!gtin) return false;
  const a = gtin.replace(/\D/g, "").replace(/^0+/, "");
  const b = code.replace(/\D/g, "").replace(/^0+/, "");
  return a.length > 0 && a === b;
}

/** Scale per-100g macros to a gram amount, rounded for display and logging. */
export function scaleMacros(per100g: FdcMacros, grams: number): FdcMacros {
  const f = grams / 100;
  return {
    kcal: Math.round(per100g.kcal * f),
    proteinG: Math.round(per100g.proteinG * f * 10) / 10,
    carbsG: Math.round(per100g.carbsG * f * 10) / 10,
    fatG: Math.round(per100g.fatG * f * 10) / 10,
  };
}

/** Sort non-Branded (curated) results above Branded, preserving API order within groups. */
export function rankResults(foods: FdcFood[]): FdcFood[] {
  const curated = foods.filter((f) => f.dataType !== "Branded");
  const branded = foods.filter((f) => f.dataType === "Branded");
  return [...curated, ...branded];
}

/**
 * Curated USDA sources: Foundation and SR Legacy are lab-analyzed and Survey
 * (FNDDS) is professionally maintained by USDA nutritionists, the reference
 * data dietitians themselves use. Branded rows are manufacturer-supplied
 * label data and stay unmarked.
 */
export function isVerifiedSource(dataType: string): boolean {
  return dataType === "Foundation" || dataType === "SR Legacy" || dataType === "Survey (FNDDS)";
}

export const GRAMS_PER_OZ = 28.3495;
