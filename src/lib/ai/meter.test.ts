import { describe, expect, test } from "bun:test";

import { estCostUsd } from "./meter";

describe("estCostUsd", () => {
  test("haiku rates: $1 in / $5 out per MTok", () => {
    expect(estCostUsd("claude-haiku-4-5-20251001", { inputTokens: 1_000_000, outputTokens: 0 })).toBe(1);
    expect(estCostUsd("claude-haiku-4-5-20251001", { inputTokens: 0, outputTokens: 1_000_000 })).toBe(5);
  });

  test("a typical personalize call costs fractions of a cent", () => {
    const usd = estCostUsd("claude-haiku-4-5-20251001", { inputTokens: 1200, outputTokens: 400 });
    expect(usd).toBeCloseTo(0.0032, 6);
  });

  test("longest matching prefix wins", () => {
    expect(estCostUsd("claude-sonnet-5", { inputTokens: 1_000_000, outputTokens: 0 })).toBe(3);
  });

  test("unknown models assume the priciest tier, never undercounting", () => {
    expect(estCostUsd("some-future-model", { inputTokens: 1_000_000, outputTokens: 0 })).toBe(15);
  });

  test("rounds to micro-dollars", () => {
    const usd = estCostUsd("claude-haiku-4-5-20251001", { inputTokens: 1, outputTokens: 1 });
    expect(usd).toBe(0.000006);
  });
});
