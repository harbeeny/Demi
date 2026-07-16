import { describe, expect, test } from "bun:test";

import { HIT_TTL_MS, MISS_TTL_MS, ttlFor } from "./search-cache";

describe("search cache TTLs", () => {
  test("results with foods live a week", () => {
    expect(ttlFor({ foods: [{ fdcId: 1 }], correctedTo: null })).toBe(HIT_TTL_MS);
    expect(HIT_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  test("empty results age out in a day so new products are not hidden", () => {
    expect(ttlFor({ foods: [], correctedTo: null })).toBe(MISS_TTL_MS);
    expect(MISS_TTL_MS).toBeLessThan(HIT_TTL_MS);
  });
});
