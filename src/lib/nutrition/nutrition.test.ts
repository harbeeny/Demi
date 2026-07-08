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
