import { describe, expect, test } from "bun:test";

import { CHAINS, inferChainCounts } from "./chains";
import { hiddenSpots, rankGoToSpots, remainingLine, type TakeoutPrefRow } from "./recommend";
import { coarsen, normalizeArea, parseRegion, regionLabel } from "./region";

describe("inferChainCounts", () => {
  test("matches chain mentions on word boundaries only", () => {
    const counts = inferChainCounts([
      "Chipotle chicken bowl",
      "CAVA harissa bowl",
      "cavatappi pasta with sausage",
      "Chick-fil-A grilled sandwich",
      "chick fil a nuggets",
      "homemade burrito",
    ]);
    expect(counts.chipotle).toBe(1);
    expect(counts.cava).toBe(1);
    expect(counts.chick_fil_a).toBe(2);
    expect(counts.subway).toBeUndefined();
  });

  test("credits a chain once per entry and survives junk input", () => {
    const counts = inferChainCounts([
      "chipotle chipotle chipotle",
      "",
      "x".repeat(400),
    ]);
    expect(counts.chipotle).toBe(1);
  });

  test("dig, naya, and this bowl match without swallowing lookalikes", () => {
    const counts = inferChainCounts([
      "DIG harvest bowl",
      "dig inn charred chicken",
      "digging into leftovers",
      "NAYA chicken roll",
      "This Bowl salmon bowl",
      "ate this bowlful of chili",
    ]);
    expect(counts.dig).toBe(2);
    expect(counts.naya).toBe(1);
    expect(counts.this_bowl).toBe(1);
  });
});

describe("rankGoToSpots", () => {
  const prefs: TakeoutPrefRow[] = [
    { chain_name: "panera", affinity: "liked", source: "picker" },
    { chain_name: "chipotle", affinity: "liked", source: "favorited" },
    { chain_name: "kfc", affinity: "hidden", source: "inferred" },
  ];

  test("favorited first, then picked, then inferred by count; hidden excluded", () => {
    const ranked = rankGoToSpots(prefs, { kfc: 9, cava: 3, sweetgreen: 1, panera: 5 });
    expect(ranked.map((s) => s.id)).toEqual(["chipotle", "panera", "cava", "sweetgreen"]);
    expect(ranked[0].origin).toBe("favorited");
    expect(ranked[2].origin).toBe("inferred");
  });

  test("caps the list and drops unknown chains", () => {
    const counts = Object.fromEntries(CHAINS.map((c, i) => [c.id, 100 - i]));
    expect(rankGoToSpots([], { ...counts, not_a_chain: 999 }, 6)).toHaveLength(6);
  });

  test("hiddenSpots lists only hidden rows", () => {
    expect(hiddenSpots(prefs).map((s) => s.id)).toEqual(["kfc"]);
  });
});

describe("remainingLine", () => {
  test("plain numbers while under target", () => {
    expect(remainingLine({ kcal: 642.4, proteinG: 45.2, carbsG: 10, fatG: 10 })).toBe(
      "≈ 642 kcal · 45g protein left today",
    );
  });
  test("neutral past-target phrasing, protein never negative", () => {
    expect(remainingLine({ kcal: -180, proteinG: -5, carbsG: 0, fatG: 0 })).toBe(
      "≈ 180 kcal past today's target",
    );
  });
});

describe("region", () => {
  test("coarsen rounds to ~1.1 km cells", () => {
    expect(coarsen(40.712776, -74.005974)).toEqual({ lat: 40.71, lng: -74.01 });
  });

  test("normalizeArea bounds and cleans typed input", () => {
    expect(normalizeArea("  New   York ")).toBe("New York");
    expect(normalizeArea("10012")).toBe("10012");
    expect(normalizeArea("x")).toBeNull();
    expect(normalizeArea("<script>")).toBeNull();
    expect(normalizeArea("a".repeat(41))).toBeNull();
  });

  test("parseRegion validates DB values and re-coarsens gps points", () => {
    expect(parseRegion({ source: "gps", lat: 40.712776, lng: -74.005974 })).toEqual({
      source: "gps",
      lat: 40.71,
      lng: -74.01,
    });
    expect(parseRegion({ source: "gps", lat: 999, lng: 0 })).toBeNull();
    expect(parseRegion({ source: "typed", area: "Astoria" })).toEqual({
      source: "typed",
      area: "Astoria",
    });
    expect(parseRegion({ source: "typed", area: "<x>" })).toBeNull();
    expect(parseRegion("gps")).toBeNull();
    expect(parseRegion(null)).toBeNull();
  });

  test("regionLabel names each state", () => {
    expect(regionLabel(null)).toBe("Add location");
    expect(regionLabel({ source: "gps", lat: 1, lng: 2 })).toBe("Using your rough location");
    expect(regionLabel({ source: "typed", area: "10012" })).toBe("Near 10012");
  });
});
