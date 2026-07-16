import { describe, expect, test } from "bun:test";

import { isStale, needsRun, MAX_ATTEMPTS, STALE_MS } from "./jobs";

const NOW = 1_800_000_000_000;

describe("job staleness", () => {
  test("no claim timestamp means stale (never actually started)", () => {
    expect(isStale(null, NOW)).toBe(true);
  });

  test("fresh claims are not stale; old ones are", () => {
    expect(isStale(new Date(NOW - 5_000).toISOString(), NOW)).toBe(false);
    expect(isStale(new Date(NOW - STALE_MS - 1_000).toISOString(), NOW)).toBe(true);
  });
});

describe("needsRun (poll-driven adoption)", () => {
  test("queued jobs always need a runner", () => {
    expect(needsRun({ status: "queued", claimed_at: null, attempts: 0 }, NOW)).toBe(true);
  });

  test("a live running job is left alone", () => {
    expect(
      needsRun(
        { status: "running", claimed_at: new Date(NOW - 5_000).toISOString(), attempts: 1 },
        NOW,
      ),
    ).toBe(false);
  });

  test("a stale running job (dead serverless runner) gets adopted", () => {
    expect(
      needsRun(
        { status: "running", claimed_at: new Date(NOW - STALE_MS - 1).toISOString(), attempts: 1 },
        NOW,
      ),
    ).toBe(true);
  });

  test("terminal states and exhausted attempts never re-run", () => {
    expect(needsRun({ status: "done", claimed_at: null, attempts: 1 }, NOW)).toBe(false);
    expect(needsRun({ status: "failed", claimed_at: null, attempts: 3 }, NOW)).toBe(false);
    expect(
      needsRun({ status: "queued", claimed_at: null, attempts: MAX_ATTEMPTS }, NOW),
    ).toBe(false);
  });
});
