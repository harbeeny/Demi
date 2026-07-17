import { describe, expect, test } from "bun:test";

import { bmr } from "./bmr";
import { tdee, ACTIVITY_MULTIPLIERS } from "./tdee";
import { targets, CALORIE_FLOORS } from "./targets";
import { distribute } from "./distribute";
import type { ProfileInput } from "./types";

const baseProfile: ProfileInput = {
  sex: "male",
  age: 30,
  heightCm: 180,
  weightKg: 80,
  goal: "lose_fat",
  goalRate: 0.5,
  activityLevel: "moderate",
  mealsPerDay: 3,
  eatingWindowStart: 8,
  eatingWindowEnd: 20,
  trainingDays: [],
  trainingTime: null,
};

describe("bmr (Mifflin-St Jeor)", () => {
  test("male 30y 180cm 80kg = 1780", () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5
    expect(bmr("male", 30, 180, 80).value).toBe(1780);
  });

  test("female 30y 165cm 60kg = 1320", () => {
    // 10*60 + 6.25*165 - 5*30 - 161 = 600 + 1031.25 - 150 - 161 = 1320.25 -> 1320
    expect(bmr("female", 30, 165, 60).value).toBe(1320);
  });

  test("other uses midpoint constant", () => {
    const male = bmr("male", 30, 170, 70).value;
    const female = bmr("female", 30, 170, 70).value;
    const other = bmr("other", 30, 170, 70).value;
    expect(other).toBeGreaterThan(female);
    expect(other).toBeLessThan(male);
  });

  test("rejects non-positive inputs", () => {
    expect(() => bmr("male", 0, 180, 80)).toThrow();
    expect(() => bmr("male", 30, -1, 80)).toThrow();
  });

  test("includes reasoning", () => {
    const r = bmr("male", 30, 180, 80);
    expect(r.reasoning.rule).toBe("mifflin_st_jeor");
    expect(r.reasoning.explanation).toContain("1780");
  });
});

describe("bmr (Katch-McArdle with body fat)", () => {
  test("male 80kg at 15% = 370 + 21.6*68 = 1839", () => {
    const r = bmr("male", 30, 180, 80, 15);
    expect(r.value).toBe(1839);
    expect(r.reasoning.rule).toBe("katch_mcardle");
    expect(r.reasoning.inputs.leanMassKg).toBe(68);
  });

  test("same lean mass gives the same BMR regardless of sex", () => {
    expect(bmr("female", 30, 165, 80, 15).value).toBe(bmr("male", 30, 180, 80, 15).value);
  });

  test("null, undefined, and out-of-band body fat fall back to Mifflin", () => {
    const mifflin = bmr("male", 30, 180, 80).value;
    expect(bmr("male", 30, 180, 80, null).value).toBe(mifflin);
    expect(bmr("male", 30, 180, 80, undefined).value).toBe(mifflin);
    expect(bmr("male", 30, 180, 80, 2).value).toBe(mifflin);
    expect(bmr("male", 30, 180, 80, 71).value).toBe(mifflin);
    expect(bmr("male", 30, 180, 80, NaN).value).toBe(mifflin);
  });

  test("targets use body fat when present", () => {
    const base = { ...baseProfile, bodyFatPct: null };
    const withBf = { ...baseProfile, bodyFatPct: 15 };
    expect(targets(withBf).kcal.reasoning.inputs.bmr).not.toBe(targets(base).kcal.reasoning.inputs.bmr);
    expect(targets(withBf).kcal.reasoning.inputs.bmr).toBe(bmr(baseProfile.sex, baseProfile.age, baseProfile.heightCm, baseProfile.weightKg, 15).value);
  });
});

describe("tdee", () => {
  test("applies each activity multiplier", () => {
    for (const [level, mult] of Object.entries(ACTIVITY_MULTIPLIERS)) {
      expect(tdee(1780, level as keyof typeof ACTIVITY_MULTIPLIERS).value).toBe(Math.round(1780 * mult));
    }
  });

  test("rejects non-positive bmr", () => {
    expect(() => tdee(0, "moderate")).toThrow();
  });
});

describe("targets", () => {
  test("0.5 kg/week cut subtracts 550 kcal from TDEE", () => {
    const t = targets(baseProfile);
    // TDEE = 1780 * 1.55 = 2759; delta = round(0.5*7700/7) = 550
    expect(t.kcal.value).toBe(2759 - 550);
    expect(t.flooredBySafety).toBe(false);
  });

  test("build_muscle adds a surplus", () => {
    const t = targets({ ...baseProfile, goal: "build_muscle", goalRate: 0.25 });
    expect(t.kcal.value).toBe(2759 + Math.round((0.25 * 7700) / 7));
  });

  test("maintain and improve_health sit at TDEE", () => {
    expect(targets({ ...baseProfile, goal: "maintain", goalRate: null }).kcal.value).toBe(2759);
    expect(targets({ ...baseProfile, goal: "improve_health", goalRate: null }).kcal.value).toBe(2759);
  });

  test("SAFETY: calorie floor is enforced for aggressive cuts", () => {
    const tiny: ProfileInput = {
      ...baseProfile,
      sex: "female",
      heightCm: 150,
      weightKg: 45,
      age: 60,
      activityLevel: "sedentary",
      goalRate: 1.0,
    };
    const t = targets(tiny);
    expect(t.kcal.value).toBe(CALORIE_FLOORS.female);
    expect(t.flooredBySafety).toBe(true);
    expect(t.kcal.reasoning.rule).toBe("safety_floor");
  });

  test("SAFETY: loss rate is capped at 1% bodyweight per week", () => {
    const t = targets({ ...baseProfile, goalRate: 1.0 }); // 80kg -> max 0.8 kg/wk
    expect(t.rateCappedBySafety).toBe(true);
    expect(t.kcal.reasoning.rule).toBe("rate_capped_goal_delta");
    // delta = round(0.8 * 7700 / 7) = 880, TDEE 2759
    expect(t.kcal.value).toBe(2759 - 880);
    // an in-bounds rate is untouched
    expect(targets(baseProfile).rateCappedBySafety).toBe(false);
  });

  test("SAFETY: floor never drops below 0.8 x BMR even above the sex floor", () => {
    const big: ProfileInput = {
      ...baseProfile,
      weightKg: 100,
      heightCm: 190,
      age: 20,
      activityLevel: "sedentary",
      goalRate: 1.0,
    };
    const t = targets(big);
    // BMR = 2093, floor = max(1500, round(2093*0.8)=1674) = 1674
    expect(t.kcal.value).toBeGreaterThanOrEqual(1674);
    expect(t.flooredBySafety).toBe(true);
  });

  test("SAFETY: underweight fat-loss goals become maintenance with supportive copy", () => {
    const underweight: ProfileInput = {
      ...baseProfile,
      weightKg: 55, // BMI 17.0 at 180cm
    };
    const t = targets(underweight);
    expect(t.underweightMaintenanceApplied).toBe(true);
    expect(t.kcal.reasoning.rule).toBe("underweight_maintenance");
    // sits at TDEE, no deficit
    const maintenance = targets({ ...underweight, goal: "maintain", goalRate: null });
    expect(t.kcal.value).toBe(maintenance.kcal.value);
    // copy is supportive, not restrictive
    expect(t.kcal.reasoning.explanation).toContain("fueling well");
  });

  test("SAFETY: minors get maintenance regardless of goal", () => {
    const minor = targets({ ...baseProfile, age: 16 });
    const maintenance = targets({ ...baseProfile, age: 16, goal: "maintain", goalRate: null });
    expect(minor.kcal.value).toBe(maintenance.kcal.value);
    expect(minor.minorMaintenanceApplied).toBe(true);
    expect(minor.kcal.reasoning.rule).toBe("minor_maintenance");
  });

  test("protein anchored to bodyweight by goal", () => {
    expect(targets(baseProfile).proteinG.value).toBe(160); // 2.0 g/kg cut
    expect(targets({ ...baseProfile, goal: "maintain", goalRate: null }).proteinG.value).toBe(128); // 1.6
  });

  test("fat never drops below 0.8 g/kg", () => {
    const t = targets(baseProfile);
    expect(t.fatG.value).toBeGreaterThanOrEqual(0.8 * baseProfile.weightKg);
  });

  test("macros add back up to kcal within rounding error", () => {
    const t = targets(baseProfile);
    const kcalFromMacros = t.proteinG.value * 4 + t.carbsG.value * 4 + t.fatG.value * 9;
    expect(Math.abs(kcalFromMacros - t.kcal.value)).toBeLessThanOrEqual(8);
  });

  test("fiber scales with kcal", () => {
    const t = targets(baseProfile);
    expect(t.fiberG.value).toBe(Math.round((t.kcal.value / 1000) * 14));
  });

  test("us display units convert copy but never the math", () => {
    const metric = targets(baseProfile);
    const us = targets(baseProfile, { displayUnits: "us" });
    // identical numbers
    expect(us.kcal.value).toBe(metric.kcal.value);
    expect(us.proteinG.value).toBe(metric.proteinG.value);
    // converted copy: 0.5 kg/week -> 1.1 lb/week, 2 g/kg -> 0.9 g/lb
    expect(us.kcal.reasoning.explanation).toContain("1.1 lb/week");
    expect(us.proteinG.reasoning.explanation).toContain("0.9 g per lb");
    expect(metric.kcal.reasoning.explanation).toContain("0.5 kg/week");
  });

  test("every macro carries reasoning", () => {
    const t = targets(baseProfile);
    for (const macro of [t.kcal, t.proteinG, t.fatG, t.carbsG, t.fiberG]) {
      expect(macro.reasoning.rule.length).toBeGreaterThan(0);
      expect(macro.reasoning.explanation.length).toBeGreaterThan(0);
    }
  });
});

describe("distribute", () => {
  const aTuesday = new Date("2026-07-07T12:00:00"); // Tuesday

  test("3 meals spread evenly across the eating window", () => {
    const slots = distribute(targets(baseProfile), baseProfile, aTuesday);
    expect(slots.map((s) => s.slot)).toEqual(["breakfast", "lunch", "dinner"]);
    expect(slots[0].timeHour).toBe(8);
    expect(slots[1].timeHour).toBe(14);
    expect(slots[2].timeHour).toBe(20);
  });

  test("protein is even across all meals", () => {
    const slots = distribute(targets(baseProfile), baseProfile, aTuesday);
    const proteins = slots.map((s) => s.proteinG);
    expect(Math.max(...proteins) - Math.min(...proteins)).toBeLessThanOrEqual(1);
  });

  test("slot totals sum to daily targets within rounding", () => {
    const t = targets(baseProfile);
    const slots = distribute(t, baseProfile, aTuesday);
    const sum = (k: "kcal" | "proteinG" | "carbsG" | "fatG") => slots.reduce((a, s) => a + s[k], 0);
    expect(Math.abs(sum("proteinG") - t.proteinG.value)).toBeLessThanOrEqual(3);
    expect(Math.abs(sum("carbsG") - t.carbsG.value)).toBeLessThanOrEqual(3);
    expect(Math.abs(sum("fatG") - t.fatG.value)).toBeLessThanOrEqual(3);
    expect(Math.abs(sum("kcal") - t.kcal.value)).toBeLessThanOrEqual(30);
  });

  test("snacks carry a smaller share than mains", () => {
    const p = { ...baseProfile, mealsPerDay: 4 };
    const slots = distribute(targets(p), p, aTuesday);
    const snack = slots.find((s) => s.slot === "snack")!;
    const main = slots.find((s) => s.slot === "lunch")!;
    expect(snack.kcal).toBeLessThan(main.kcal);
  });

  test("training day shifts carbs to the nearest meal", () => {
    const p: ProfileInput = { ...baseProfile, trainingDays: ["tuesday"], trainingTime: "18:30" };
    const t = targets(p);
    const trained = distribute(t, p, aTuesday);
    const rested = distribute(t, baseProfile, aTuesday);
    // dinner (20:00) is nearest to 18:30
    expect(trained[2].carbsG).toBeGreaterThan(rested[2].carbsG);
    expect(trained[2].reasoning.rule).toBe("training_adjacent_carbs");
    // and it comes out of the other meals
    expect(trained[0].carbsG).toBeLessThan(rested[0].carbsG);
  });

  test("non-training weekday ignores training time", () => {
    const p: ProfileInput = { ...baseProfile, trainingDays: ["saturday"], trainingTime: "18:30" };
    const slots = distribute(targets(p), p, aTuesday);
    expect(slots.every((s) => s.reasoning.rule === "even_distribution")).toBe(true);
  });

  test("rejects unsupported meal counts", () => {
    expect(() => distribute(targets(baseProfile), { ...baseProfile, mealsPerDay: 9 }, aTuesday)).toThrow();
  });
});

describe("targets with adaptive TDEE correction", () => {
  // baseProfile: BMR 1780, TDEE 2759 (moderate 1.55), lose_fat 0.5 kg/wk -> -550

  test("correction shifts kcal exactly and surfaces its reasoning", () => {
    const t = targets({ ...baseProfile, tdeeCorrection: -150 });
    const uncorrected = targets(baseProfile);
    expect(t.kcal.value).toBe(uncorrected.kcal.value - 150);
    expect(t.tdeeCorrection?.value).toBe(-150);
    expect(t.tdeeCorrection?.reasoning.rule).toBe("adaptive_tdee_correction");
    expect(t.kcal.reasoning.inputs.adjustedTdee).toBe(2759 - 150);
    expect(t.tdeeCorrection?.reasoning.explanation).not.toContain("—");
  });

  test("null, zero, and absent corrections are byte-identical to before", () => {
    const absent = targets(baseProfile);
    const asNull = targets({ ...baseProfile, tdeeCorrection: null });
    const asZero = targets({ ...baseProfile, tdeeCorrection: 0 });
    expect(asNull).toEqual(absent);
    expect(asZero).toEqual(absent);
    expect(absent.tdeeCorrection).toBeNull();
  });

  test("out-of-range correction clamps to -500 and floors still bind", () => {
    const t = targets({ ...baseProfile, tdeeCorrection: -900 });
    // clamped to -500: 2759 - 500 - 550 = 1709, above floor 1500 -> applies
    expect(t.tdeeCorrection?.value).toBe(-500);
    expect(t.kcal.value).toBe(1709);
    // smaller body where the clamp would breach the floor: floor wins
    const small = targets({
      ...baseProfile,
      sex: "female",
      heightCm: 160,
      weightKg: 58,
      tdeeCorrection: -900,
    });
    const floor = Math.max(CALORIE_FLOORS.female, Math.round(bmr("female", 30, 160, 58).value * 0.8));
    expect(small.kcal.value).toBe(floor);
    expect(small.flooredBySafety).toBe(true);
  });
});
