import { describe, expect, test } from "bun:test";

import { EMPTY_PRIMER, primerDue, withAsk, withBriefDay } from "./push-primer";

describe("withBriefDay", () => {
  test("collects distinct days only", () => {
    let s = withBriefDay(EMPTY_PRIMER, "2026-07-22");
    s = withBriefDay(s, "2026-07-22");
    s = withBriefDay(s, "2026-07-23");
    expect(s.briefDays).toEqual(["2026-07-22", "2026-07-23"]);
  });
});

describe("primerDue", () => {
  const twoDays = withBriefDay(withBriefDay(EMPTY_PRIMER, "2026-07-22"), "2026-07-23");

  test("due from the second brief day while the OS can still be asked", () => {
    expect(primerDue(twoDays, "2026-07-23", "prompt")).toBe(true);
  });

  test("never on day one: value before the ask", () => {
    const oneDay = withBriefDay(EMPTY_PRIMER, "2026-07-22");
    expect(primerDue(oneDay, "2026-07-22", "prompt")).toBe(false);
  });

  test("never when permission is settled or unknowable", () => {
    expect(primerDue(twoDays, "2026-07-23", "granted")).toBe(false);
    expect(primerDue(twoDays, "2026-07-23", "denied")).toBe(false);
    expect(primerDue(twoDays, "2026-07-23", null)).toBe(false);
  });

  test("a Not yet backs off for seven days", () => {
    const asked = withAsk(twoDays, "2026-07-23");
    expect(primerDue(asked, "2026-07-29", "prompt")).toBe(false);
    expect(primerDue(asked, "2026-07-30", "prompt")).toBe(true);
  });

  test("never more than two asks total", () => {
    const twice = withAsk(withAsk(twoDays, "2026-07-23"), "2026-07-30");
    expect(primerDue(twice, "2026-09-01", "prompt")).toBe(false);
  });
});
