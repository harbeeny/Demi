import { describe, expect, test } from "bun:test";

import { buildReflectionPayload, deterministicReflection, type ReflectionInput } from "./reflect";
import { numbersAreGrounded } from "./validate";

const input: ReflectionInput = {
  targets: { kcal: 2615, proteinG: 120, carbsG: 399, fatG: 60 },
  planned: { kcal: 2480, proteinG: 118, carbsG: 370, fatG: 58 },
  actual: { kcal: 1900, proteinG: 88, carbsG: 260, fatG: 50 },
  loggedMeals: [
    { name: "Breakfast burrito", slot: "breakfast", kcal: 480, proteinG: 26 },
    { name: "Chicken burrito bowl", slot: "lunch", kcal: 580, proteinG: 40 },
  ],
  energy: 4,
};

describe("deterministicReflection", () => {
  test("its own numbers are grounded in the payload it describes", () => {
    const payloadText = JSON.stringify(buildReflectionPayload(input));
    const out = deterministicReflection(input);
    expect(numbersAreGrounded(out.reflection, payloadText)).toBe(true);
  });

  test("never shames or praises restriction", () => {
    const under: ReflectionInput = { ...input, actual: { kcal: 900, proteinG: 40, carbsG: 100, fatG: 20 } };
    const over: ReflectionInput = { ...input, actual: { kcal: 3400, proteinG: 150, carbsG: 500, fatG: 90 } };
    for (const i of [input, under, over]) {
      const out = deterministicReflection(i);
      const text = out.reflection + " " + out.tweak;
      expect(text).not.toMatch(/deficit|only ate|good job staying under|earned|too much|blew|cheat/i);
      expect(text).not.toContain("—");
    }
  });

  test("large protein gap yields the protein tweak", () => {
    expect(deterministicReflection(input).tweak).toContain("protein");
  });

  test("on-track day yields the keep-the-rhythm tweak", () => {
    const onTrack: ReflectionInput = {
      ...input,
      actual: { kcal: 2500, proteinG: 115, carbsG: 380, fatG: 58 },
    };
    expect(deterministicReflection(onTrack).tweak).toContain("Consistency");
  });

  test("tweak is always non-empty and marked as fallback", () => {
    const out = deterministicReflection(input);
    expect(out.tweak.length).toBeGreaterThan(0);
    expect(out.fallbackUsed).toBe(true);
  });
});

describe("buildReflectionPayload", () => {
  test("contains every number the fallback copy uses", () => {
    const text = JSON.stringify(buildReflectionPayload(input));
    expect(text).toContain("88");
    expect(text).toContain("120");
  });

  test("omits planned on log-only days", () => {
    const payload = buildReflectionPayload({ ...input, planned: null }) as { planned: unknown };
    expect(payload.planned).toBeNull();
  });
});
