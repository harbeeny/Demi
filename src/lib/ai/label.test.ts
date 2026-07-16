import { describe, expect, test } from "bun:test";

import { buildLabelMessages, parseLabelResponse } from "./label";

describe("parseLabelResponse", () => {
  test("parses a clean reading with serving grams", () => {
    const r = parseLabelResponse(
      '{"name": "Crunchy Peanut Butter", "servingGrams": 32, "servingText": "2 tbsp", "kcal": 190, "proteinG": 8, "carbsG": 8, "fatG": 16}',
    )!;
    expect(r.name).toBe("Crunchy Peanut Butter");
    expect(r.servingGrams).toBe(32);
    expect(r.servingText).toBe("2 tbsp");
    expect(r.kcal).toBe(190);
  });

  test("survives markdown fences and missing name", () => {
    const r = parseLabelResponse(
      '```json\n{"name": null, "servingGrams": null, "servingText": "1 cup", "kcal": 150, "proteinG": 5, "carbsG": 20, "fatG": 5}\n```',
    )!;
    expect(r.name).toBe("Label scan");
    expect(r.servingGrams).toBeNull();
  });

  test("zero-calorie labels parse (diet soda)", () => {
    const r = parseLabelResponse(
      '{"name": "Zero Cola", "servingGrams": 355, "servingText": "1 can", "kcal": 0, "proteinG": 0, "carbsG": 0, "fatG": 0}',
    )!;
    expect(r.kcal).toBe(0);
  });

  test("rejects unreadable, malformed, and out-of-bounds output", () => {
    expect(parseLabelResponse('{"error": "unreadable"}')).toBeNull();
    expect(parseLabelResponse("not json at all")).toBeNull();
    expect(
      parseLabelResponse('{"kcal": 90000, "proteinG": 1, "carbsG": 1, "fatG": 1}'),
    ).toBeNull();
    // inconsistent: kcal wildly off from macros
    expect(
      parseLabelResponse('{"kcal": 1500, "proteinG": 8, "carbsG": 8, "fatG": 16}'),
    ).toBeNull();
  });

  test("clamps absurd serving grams to null", () => {
    const r = parseLabelResponse(
      '{"name": "Soup", "servingGrams": 90000, "kcal": 100, "proteinG": 4, "carbsG": 12, "fatG": 4}',
    )!;
    expect(r.servingGrams).toBeNull();
  });
});

describe("buildLabelMessages", () => {
  test("image block first, instruction second", () => {
    const blocks = buildLabelMessages("QUJD", "image/jpeg");
    expect(blocks[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: "QUJD" },
    });
    expect(blocks[1].type).toBe("text");
  });
});
