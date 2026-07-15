import { describe, expect, test } from "bun:test";

import { correctQuery, correctWord, editDistance, fallbackQueries, pluralFlip } from "./spell";

describe("editDistance", () => {
  test("counts substitutions, insertions, and deletions", () => {
    expect(editDistance("yogert", "yogurt")).toBe(1);
    expect(editDistance("yogrt", "yogurt")).toBe(1);
    expect(editDistance("chiken", "chicken")).toBe(1);
    expect(editDistance("egg", "egg")).toBe(0);
    expect(editDistance("", "abc")).toBe(3);
  });
});

describe("correctWord", () => {
  test("fixes common food typos", () => {
    expect(correctWord("chiken")).toBe("chicken");
    expect(correctWord("yogert")).toBe("yogurt");
    expect(correctWord("brocolli")).toBe("broccoli");
    expect(correctWord("bannana")).toBe("banana");
  });

  test("leaves real food words alone", () => {
    expect(correctWord("egg")).toBeNull();
    expect(correctWord("eggs")).toBeNull();
    expect(correctWord("chicken")).toBeNull();
    expect(correctWord("yogurt")).toBeNull();
  });

  test("never touches short words or gibberish", () => {
    expect(correctWord("eg")).toBeNull();
    expect(correctWord("zzzzqq")).toBeNull();
    expect(correctWord("123")).toBeNull();
  });

  test("short words demand a closer match than long ones", () => {
    // 4 letters: only 1 edit allowed, so a 2-edit stretch stays null
    expect(correctWord("rixe")).toBe("rice");
    expect(correctWord("roxi")).toBeNull();
  });
});

describe("correctQuery", () => {
  test("corrects each misspelled word and keeps the rest", () => {
    expect(correctQuery("chiken brest")).toBe("chicken breast");
    expect(correctQuery("greek yogert")).toBe("greek yogurt");
  });

  test("returns null when nothing needed fixing", () => {
    expect(correctQuery("chicken breast")).toBeNull();
    expect(correctQuery("egg")).toBeNull();
  });
});

describe("pluralFlip", () => {
  test("flips the last word both directions", () => {
    expect(pluralFlip("egg")).toBe("eggs");
    expect(pluralFlip("eggs")).toBe("egg");
    expect(pluralFlip("chicken breast")).toBe("chicken breasts");
  });

  test("skips non-word tails", () => {
    expect(pluralFlip("100 g")).toBeNull();
  });
});

describe("fallbackQueries", () => {
  test("orders spell correction before plural flip, deduplicated", () => {
    expect(fallbackQueries("chiken")).toEqual(["chicken", "chikens"]);
    expect(fallbackQueries("egg")).toEqual(["eggs"]);
  });

  test("never re-suggests the original query", () => {
    expect(fallbackQueries("eggs")).toEqual(["egg"]);
  });
});
