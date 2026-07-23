import { describe, expect, test } from "bun:test";

import {
  apnsHostFor,
  backoffMs,
  balanceMorningDecision,
  buildMorningBrief,
  categoryFor,
  formatHourLabel,
  inQuietHours,
  isTokenGone,
  isTransient,
  kindFamily,
  mealReminderDue,
  morningBriefDecision,
  morningBriefHour,
  parseTimeToHour,
  pool,
  preferenceFilter,
  type PreferenceState,
  prepAnchorDecision,
  buildPrepAnchor,
  buildEveningClose,
  eveningCloseDecision,
  eveningCloseHour,
  ignoreDecay,
  pickNoCookSuggestion,
  shouldReleaseClaim,
} from "./logic";

describe("parseTimeToHour", () => {
  test("HH:MM to fractional hours", () => {
    expect(parseTimeToHour("17:30")).toBe(17.5);
    expect(parseTimeToHour("05:00")).toBe(5);
    expect(parseTimeToHour("0:15")).toBe(0.25);
  });

  test("missing or malformed is null", () => {
    expect(parseTimeToHour(null)).toBe(null);
    expect(parseTimeToHour(undefined)).toBe(null);
    expect(parseTimeToHour("soon")).toBe(null);
    expect(parseTimeToHour("25:00")).toBe(null);
  });
});

describe("formatHourLabel", () => {
  test("12-hour default, 24-hour on preference", () => {
    expect(formatHourLabel(17.5)).toBe("5:30 pm");
    expect(formatHourLabel(17.5, true)).toBe("17:30");
    expect(formatHourLabel(6, null)).toBe("6:00 am");
  });
});

describe("morningBriefHour", () => {
  const noQuiet = { quietStart: 2, quietEnd: 2.5 }; // out of the way

  test("30 minutes before the eating window opens", () => {
    expect(morningBriefHour({ windowStart: 8, trainHour: null, ...noQuiet })).toBe(7.5);
  });

  test("early training pulls the brief earlier; late training does not", () => {
    expect(morningBriefHour({ windowStart: 8, trainHour: 6, ...noQuiet })).toBe(5);
    expect(morningBriefHour({ windowStart: 8, trainHour: 18, ...noQuiet })).toBe(7.5);
  });

  test("a brief inside quiet hours waits for quiet end", () => {
    // default quiet 21:30-07:00: a 6am lifter's tapered 5:00 brief holds
    // until 7:00 (quiet hours win over the taper, per the spec)
    expect(morningBriefHour({ windowStart: 8, trainHour: 6, quietStart: null, quietEnd: null })).toBe(7);
    expect(morningBriefHour({ windowStart: 8, trainHour: null, quietStart: 21.5, quietEnd: 7.75 })).toBe(7.75);
  });

  test("never negative", () => {
    expect(morningBriefHour({ windowStart: 0.25, trainHour: null, ...noQuiet })).toBe(0);
  });
});

describe("morningBriefDecision", () => {
  test("fires inside the 2-hour window when a plan exists", () => {
    expect(morningBriefDecision({ nowH: 7.6, briefHour: 7.5, hasPlan: true })).toEqual({
      due: true,
      fire: true,
    });
  });

  test("not due before the hour or after the window closes", () => {
    expect(morningBriefDecision({ nowH: 7.4, briefHour: 7.5, hasPlan: true })).toEqual({ due: false });
    expect(morningBriefDecision({ nowH: 9.5, briefHour: 7.5, hasPlan: true })).toEqual({ due: false });
  });

  test("a day without a plan is a logged suppression, not a push", () => {
    expect(morningBriefDecision({ nowH: 8, briefHour: 7.5, hasPlan: false })).toEqual({
      due: true,
      fire: false,
      reason: "no-plan",
    });
  });
});

describe("buildMorningBrief", () => {
  test("training day carries the lifting clause", () => {
    expect(
      buildMorningBrief({
        trainLabel: "5:30 pm",
        proteinG: 152,
        kcal: 2200,
        anchorName: "Chicken burrito bowl",
        anchorPrepMin: 25,
      }),
    ).toEqual({
      title: "Lifting at 5:30 pm. 152g protein, 2200 cal.",
      body: "Chicken burrito bowl is the big one: 25 min. Everything else is easy.",
    });
  });

  test("rest day drops the clause", () => {
    const brief = buildMorningBrief({
      trainLabel: null,
      proteinG: 120,
      kcal: 1900,
      anchorName: "Skillet lasagna",
      anchorPrepMin: 40,
    });
    expect(brief.title).toBe("Today: 120g protein, 1900 cal.");
    expect(brief.body).toBe("Skillet lasagna is the big one: 40 min. Everything else is easy.");
  });
});

describe("categoryFor", () => {
  test("the brief has its own action set; everything else is a slot", () => {
    expect(categoryFor("morning-brief")).toBe("DEMI_BRIEF");
    expect(categoryFor("slot-1")).toBe("DEMI_SLOT");
    expect(categoryFor("reflect")).toBe("DEMI_SLOT");
  });
});

describe("kindFamily", () => {
  test("meal reminder kinds collapse to one family", () => {
    expect(kindFamily("slot-0")).toBe("meal-reminder");
    expect(kindFamily("slot-2")).toBe("meal-reminder");
    expect(kindFamily("prep-anchor")).toBe("meal-reminder");
    expect(kindFamily("reflect")).toBe("reflect");
    expect(kindFamily("balance-morning")).toBe("balance-morning");
    expect(kindFamily("morning-brief")).toBe("morning-brief");
  });
});

describe("prepAnchorDecision", () => {
  const base = { nowH: 19, anchorHour: 20, requiresThaw: false, anchorLogged: false };

  test("fires an hour out for a normal meal, 90 minutes for a thaw", () => {
    expect(prepAnchorDecision(base)).toEqual({ due: true, fire: true });
    expect(prepAnchorDecision({ ...base, nowH: 18.9 })).toEqual({ due: false });
    expect(prepAnchorDecision({ ...base, nowH: 18.6, requiresThaw: true })).toEqual({
      due: true,
      fire: true,
    });
  });

  test("stops being useful 15 minutes before the meal", () => {
    expect(prepAnchorDecision({ ...base, nowH: 19.7 })).toEqual({ due: true, fire: true });
    expect(prepAnchorDecision({ ...base, nowH: 19.75 })).toEqual({ due: false });
    expect(prepAnchorDecision({ ...base, nowH: 20.5 })).toEqual({ due: false });
  });

  test("an already-logged anchor is silence on success", () => {
    expect(prepAnchorDecision({ ...base, anchorLogged: true })).toEqual({
      due: true,
      fire: false,
      reason: "anchor-already-logged",
    });
  });

  test("no scheduled time means nothing to anchor to", () => {
    expect(prepAnchorDecision({ ...base, anchorHour: undefined })).toEqual({ due: false });
  });
});

describe("buildPrepAnchor", () => {
  test("thaw and standard variants, with the deficit line", () => {
    expect(
      buildPrepAnchor({
        requiresThaw: true,
        mealName: "Turkey meatballs with whole-wheat pasta",
        prepMin: 40,
        proteinRemaining: 38,
      }),
    ).toEqual({
      title: "Start thawing: Turkey meatballs with whole-wheat pasta",
      body: "You're 38g of protein behind. This meal closes it.",
    });
    expect(
      buildPrepAnchor({
        requiresThaw: false,
        mealName: "Skillet lasagna",
        prepMin: 35,
        proteinRemaining: 0,
      }),
    ).toEqual({
      title: "Start soon: Skillet lasagna (35 min)",
      body: "Tonight's anchor meal. You're already on track.",
    });
  });
});

describe("inQuietHours", () => {
  test("overnight range wraps midnight (default 21:30 to 07:00)", () => {
    expect(inQuietHours(22, null, null)).toBe(true);
    expect(inQuietHours(3, null, null)).toBe(true);
    expect(inQuietHours(21.5, null, null)).toBe(true);
    expect(inQuietHours(21.4, null, null)).toBe(false);
    expect(inQuietHours(7, null, null)).toBe(false); // end is exclusive
    expect(inQuietHours(12, null, null)).toBe(false);
  });

  test("same-day range and degenerate equal bounds", () => {
    expect(inQuietHours(12, 9, 17)).toBe(true);
    expect(inQuietHours(20, 9, 17)).toBe(false);
    expect(inQuietHours(12, 12, 12)).toBe(false);
  });
});

describe("preferenceFilter", () => {
  const base: PreferenceState = {
    intensity: null,
    quietStart: null,
    quietEnd: null,
    killedFamilies: new Set(),
  };
  const noon = 12;

  test("defaults send everything outside quiet hours", () => {
    expect(preferenceFilter("slot-1", noon, base)).toEqual({ send: true });
    expect(preferenceFilter("reflect", noon, base)).toEqual({ send: true });
  });

  test("a killed family stays dead and wins over everything", () => {
    const prefs = { ...base, killedFamilies: new Set(["meal-reminder"]) };
    expect(preferenceFilter("slot-0", noon, prefs)).toEqual({
      send: false,
      reason: "slot-killed",
    });
    expect(preferenceFilter("reflect", noon, prefs)).toEqual({ send: true });
  });

  test("checkin allows the brief, the evening close, and balance-morning only", () => {
    const prefs = { ...base, intensity: "checkin" };
    expect(preferenceFilter("slot-1", noon, prefs)).toEqual({
      send: false,
      reason: "intensity-checkin",
    });
    expect(preferenceFilter("evening-close", 20, prefs)).toEqual({ send: true });
    expect(preferenceFilter("balance-morning", 10, prefs)).toEqual({ send: true });
  });

  test("quiet intensity allows the morning families only", () => {
    const prefs = { ...base, intensity: "quiet" };
    expect(preferenceFilter("morning-brief", 8, prefs)).toEqual({ send: true });
    expect(preferenceFilter("balance-morning", 10, prefs)).toEqual({ send: true });
    expect(preferenceFilter("reflect", noon, prefs)).toEqual({
      send: false,
      reason: "intensity-quiet",
    });
    expect(preferenceFilter("slot-0", noon, prefs)).toEqual({
      send: false,
      reason: "intensity-quiet",
    });
  });

  test("checkin includes the morning brief", () => {
    expect(preferenceFilter("morning-brief", 8, { ...base, intensity: "checkin" })).toEqual({
      send: true,
    });
  });

  test("quiet hours suppress an otherwise allowed send", () => {
    expect(preferenceFilter("reflect", 22, base)).toEqual({
      send: false,
      reason: "quiet-hours",
    });
    expect(preferenceFilter("reflect", 21, { ...base, quietStart: 20.5, quietEnd: 6 })).toEqual({
      send: false,
      reason: "quiet-hours",
    });
  });

  test("an unknown intensity fails open to coach", () => {
    expect(preferenceFilter("slot-1", noon, { ...base, intensity: "loud" })).toEqual({
      send: true,
    });
  });
});

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

describe("eveningCloseHour", () => {
  test("two hours before quiet start, but never before dinner had its chance", () => {
    expect(eveningCloseHour({ quietStart: 21.5, lastMealHour: null })).toBe(19.5);
    expect(eveningCloseHour({ quietStart: null, lastMealHour: 20 })).toBe(20.5);
    expect(eveningCloseHour({ quietStart: 23, lastMealHour: 18 })).toBe(21);
  });
});

describe("eveningCloseDecision", () => {
  const base = {
    nowH: 20.6,
    closeHour: 20.5,
    quietStart: null as number | null,
    hasPlan: true,
    finished: false,
    loggedAnything: true,
    proteinLogged: 90,
    proteinTarget: 150,
  };

  test("fires on an evidenced gap inside the window", () => {
    expect(eveningCloseDecision(base)).toEqual({ due: true, fire: true });
  });

  test("not due before the close hour or once quiet hours begin", () => {
    expect(eveningCloseDecision({ ...base, nowH: 20.4 })).toEqual({ due: false });
    expect(eveningCloseDecision({ ...base, nowH: 21.5 })).toEqual({ due: false });
  });

  test("silence on success: within 10% of target sends nothing", () => {
    expect(eveningCloseDecision({ ...base, proteinLogged: 135 })).toEqual({
      due: true,
      fire: false,
      reason: "on-target",
    });
    expect(eveningCloseDecision({ ...base, proteinLogged: 134.9 })).toEqual({
      due: true,
      fire: true,
    });
  });

  test("unknowable or closed days are logged silence, not pushes", () => {
    expect(eveningCloseDecision({ ...base, loggedAnything: false })).toEqual({
      due: true,
      fire: false,
      reason: "nothing-logged",
    });
    expect(eveningCloseDecision({ ...base, finished: true })).toEqual({
      due: true,
      fire: false,
      reason: "day-already-closed",
    });
    expect(eveningCloseDecision({ ...base, hasPlan: false })).toEqual({
      due: true,
      fire: false,
      reason: "no-plan",
    });
  });
});

describe("pickNoCookSuggestion", () => {
  const catalog = [
    { name: "Skillet lasagna", proteinG: 40, prepMin: 10, cookMin: 25 },
    { name: "Greek yogurt bowl", proteinG: 24, prepMin: 3, cookMin: 0 },
    { name: "Protein smoothie", proteinG: 32, prepMin: 5, cookMin: 0 },
    { name: "Cottage cheese and fruit", proteinG: 18, prepMin: 2, cookMin: 0 },
  ];

  test("smallest no-cook option that covers the gap", () => {
    expect(pickNoCookSuggestion(catalog, 20)).toBe("Greek yogurt bowl");
    expect(pickNoCookSuggestion(catalog, 30)).toBe("Protein smoothie");
  });

  test("gap bigger than anything: biggest no-cook option", () => {
    expect(pickNoCookSuggestion(catalog, 60)).toBe("Protein smoothie");
  });

  test("cooking meals never suggested; empty catalog is null", () => {
    expect(pickNoCookSuggestion([catalog[0]], 20)).toBe(null);
  });
});

describe("buildEveningClose", () => {
  test("spec template with the tilde and a fallback suggestion", () => {
    expect(buildEveningClose({ proteinRemaining: 38, suggestion: "Greek yogurt bowl" })).toEqual({
      title: "~38g of protein short",
      body: "Greek yogurt bowl closes it.",
    });
    expect(buildEveningClose({ proteinRemaining: 52, suggestion: null }).body).toBe(
      "A protein shake closes it.",
    );
  });
});

describe("ignoreDecay", () => {
  const ignored = (date: string) => ({ date, ignored: true });
  const opened = (date: string) => ({ date, ignored: false });

  test("under three trailing ignores stays active", () => {
    expect(ignoreDecay([], "2026-07-24")).toEqual({ mode: "active" });
    expect(ignoreDecay([ignored("2026-07-22"), ignored("2026-07-23")], "2026-07-24")).toEqual({
      mode: "active",
    });
    expect(
      ignoreDecay([ignored("2026-07-21"), opened("2026-07-22"), ignored("2026-07-23")], "2026-07-24"),
    ).toEqual({ mode: "active" });
  });

  test("the third consecutive ignore pauses for seven days", () => {
    const hist = [ignored("2026-07-21"), ignored("2026-07-22"), ignored("2026-07-23")];
    expect(ignoreDecay(hist, "2026-07-24")).toEqual({ mode: "paused", until: "2026-07-30" });
    expect(ignoreDecay(hist, "2026-07-29")).toEqual({ mode: "paused", until: "2026-07-30" });
  });

  test("returns once after seven days", () => {
    const hist = [ignored("2026-07-21"), ignored("2026-07-22"), ignored("2026-07-23")];
    expect(ignoreDecay(hist, "2026-07-30")).toEqual({ mode: "probation" });
  });

  test("an ignored probation shot kills permanently", () => {
    const hist = [
      ignored("2026-07-21"),
      ignored("2026-07-22"),
      ignored("2026-07-23"),
      ignored("2026-07-31"),
    ];
    expect(ignoreDecay(hist, "2026-08-01")).toEqual({ mode: "killed" });
  });

  test("an interacted probation shot resets to active", () => {
    const hist = [
      ignored("2026-07-21"),
      ignored("2026-07-22"),
      ignored("2026-07-23"),
      opened("2026-07-31"),
    ];
    expect(ignoreDecay(hist, "2026-08-01")).toEqual({ mode: "active" });
  });

  test("mid-life adoption: extra pre-decay ignores inside the window pause, not kill", () => {
    // decay ships after 4 straight ignores landed within days of each other:
    // the pause runs from the streak's 3rd ignore; the 4th is legacy noise
    const hist = [
      ignored("2026-07-22"),
      ignored("2026-07-23"),
      ignored("2026-07-23"),
      ignored("2026-07-23"),
    ];
    expect(ignoreDecay(hist, "2026-07-24")).toEqual({ mode: "paused", until: "2026-07-30" });
    // but a trailing ignore from past the window is a spent probation
    const spanned = [
      ignored("2026-07-01"),
      ignored("2026-07-02"),
      ignored("2026-07-03"),
      ignored("2026-07-11"),
    ];
    expect(ignoreDecay(spanned, "2026-07-12")).toEqual({ mode: "killed" });
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

describe("apnsHostFor", () => {
  test("production tokens go to the production cloud", () => {
    expect(apnsHostFor("production")).toBe("api.push.apple.com");
  });
  test("development tokens go to the sandbox", () => {
    expect(apnsHostFor("development")).toBe("api.sandbox.push.apple.com");
  });
  test("legacy rows without the column resolve to the sandbox", () => {
    expect(apnsHostFor(null)).toBe("api.sandbox.push.apple.com");
    expect(apnsHostFor(undefined)).toBe("api.sandbox.push.apple.com");
  });
  test("garbage never reaches the production cloud", () => {
    expect(apnsHostFor("prod")).toBe("api.sandbox.push.apple.com");
    expect(apnsHostFor("")).toBe("api.sandbox.push.apple.com");
  });
});
