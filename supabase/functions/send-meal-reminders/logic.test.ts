import { describe, expect, test } from "bun:test";

import {
  backoffMs,
  balanceMorningDecision,
  isTokenGone,
  isTransient,
  mealReminderDue,
  pool,
  reflectDecision,
  shouldReleaseClaim,
} from "./logic";

describe("mealReminderDue", () => {
  test("due when the slot is 15-45 minutes out", () => {
    expect(mealReminderDue(14, 13.5)).toBe(true); // 30 min out
    expect(mealReminderDue(14, 13.75)).toBe(true); // 15 min out, inclusive
    expect(mealReminderDue(14, 13.26)).toBe(true); // just inside 45
  });

  test("not due when too close, past, too far, or unscheduled", () => {
    expect(mealReminderDue(14, 13.8)).toBe(false); // 12 min out
    expect(mealReminderDue(14, 14.1)).toBe(false); // already passed
    expect(mealReminderDue(14, 13.25)).toBe(false); // exactly 45 min, exclusive
    expect(mealReminderDue(undefined, 13.5)).toBe(false);
  });
});

describe("reflectDecision", () => {
  const base = { nowH: 21.5, windowEnd: 20, finished: false, logged: true };

  test("fires an hour past the window with an open, logged day", () => {
    expect(reflectDecision(base)).toEqual({ due: true, fire: true });
  });

  test("not due before the window hour passes or without a window", () => {
    expect(reflectDecision({ ...base, nowH: 21 })).toEqual({ due: false });
    expect(reflectDecision({ ...base, windowEnd: undefined })).toEqual({ due: false });
  });

  test("suppressed with reasons: day closed beats nothing logged", () => {
    expect(reflectDecision({ ...base, finished: true })).toEqual({
      due: true,
      fire: false,
      reason: "day-already-closed",
    });
    expect(reflectDecision({ ...base, logged: false })).toEqual({
      due: true,
      fire: false,
      reason: "nothing-logged",
    });
    // both true: closed wins, matching the sender's original precedence
    expect(reflectDecision({ ...base, finished: true, logged: false })).toEqual({
      due: true,
      fire: false,
      reason: "day-already-closed",
    });
  });
});

describe("balanceMorningDecision", () => {
  const base = { nowH: 9.5, balancedEvening: true, logged: false };

  test("fires 9-11am local after an evening balance, nothing logged", () => {
    expect(balanceMorningDecision(base)).toEqual({ due: true, fire: true });
  });

  test("not due outside 9-11 or without an evening balance", () => {
    expect(balanceMorningDecision({ ...base, nowH: 8.9 })).toEqual({ due: false });
    expect(balanceMorningDecision({ ...base, nowH: 11 })).toEqual({ due: false });
    expect(balanceMorningDecision({ ...base, balancedEvening: false })).toEqual({ due: false });
  });

  test("suppressed once anything is logged: silence on success", () => {
    expect(balanceMorningDecision({ ...base, logged: true })).toEqual({
      due: true,
      fire: false,
      reason: "already-logged-today",
    });
  });
});

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
