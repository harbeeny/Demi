import { describe, expect, test } from "bun:test";

import { suggestSlot } from "./slots";

describe("suggestSlot", () => {
  test("morning suggests breakfast up to 10:30", () => {
    expect(suggestSlot(6)).toBe("breakfast");
    expect(suggestSlot(10, 29)).toBe("breakfast");
  });

  test("midday suggests lunch up to 14:30", () => {
    expect(suggestSlot(10, 30)).toBe("lunch");
    expect(suggestSlot(12)).toBe("lunch");
    expect(suggestSlot(14, 29)).toBe("lunch");
  });

  test("afternoon suggests snack up to 17:00", () => {
    expect(suggestSlot(14, 30)).toBe("snack");
    expect(suggestSlot(16, 59)).toBe("snack");
  });

  test("evening suggests dinner", () => {
    expect(suggestSlot(17)).toBe("dinner");
    expect(suggestSlot(21)).toBe("dinner");
    expect(suggestSlot(23, 59)).toBe("dinner");
  });
});
