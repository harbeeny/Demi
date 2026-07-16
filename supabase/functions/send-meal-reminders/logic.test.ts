import { describe, expect, test } from "bun:test";

import {
  backoffMs,
  isTokenGone,
  isTransient,
  pool,
  shouldReleaseClaim,
} from "./logic";

describe("APNs status policy", () => {
  test("transient: network failure, rate limit, server errors", () => {
    expect(isTransient(0)).toBe(true);
    expect(isTransient(429)).toBe(true);
    expect(isTransient(500)).toBe(true);
    expect(isTransient(503)).toBe(true);
    expect(isTransient(200)).toBe(false);
    expect(isTransient(410)).toBe(false);
  });

  test("dead tokens: unregistered and bad-request", () => {
    expect(isTokenGone(410)).toBe(true);
    expect(isTokenGone(400)).toBe(true);
    expect(isTokenGone(503)).toBe(false);
  });

  test("backoff grows: 500ms then 1500ms", () => {
    expect(backoffMs(0)).toBe(500);
    expect(backoffMs(1)).toBe(1500);
  });
});

describe("shouldReleaseClaim", () => {
  test("released when nothing delivered and a retry could work", () => {
    expect(shouldReleaseClaim([503])).toBe(true);
    expect(shouldReleaseClaim([0, 429])).toBe(true);
  });

  test("kept when any device got the push (no double-notify)", () => {
    expect(shouldReleaseClaim([200, 503])).toBe(false);
    expect(shouldReleaseClaim([200])).toBe(false);
  });

  test("kept when failures are permanent (dead tokens, nothing to retry)", () => {
    expect(shouldReleaseClaim([410])).toBe(false);
    expect(shouldReleaseClaim([410, 400])).toBe(false);
  });

  test("kept when the user had no tokens at all", () => {
    expect(shouldReleaseClaim([])).toBe(false);
  });
});

describe("pool", () => {
  test("runs everything with bounded concurrency", async () => {
    let active = 0;
    let peak = 0;
    const done: number[] = [];
    await pool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      done.push(n);
      active--;
    });
    expect(done.length).toBe(7);
    expect(peak).toBeLessThanOrEqual(3);
  });

  test("one failure never stops the rest", async () => {
    const done: number[] = [];
    await pool([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      done.push(n);
    });
    expect(done.sort()).toEqual([1, 3]);
  });
});
