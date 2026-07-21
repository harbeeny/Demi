import type { Sex } from "@/lib/supabase/types";
import type { Reasoned } from "./types";

/** Body fat percentages outside this band are treated as not provided. */
export const BODY_FAT_MIN = 3;
export const BODY_FAT_MAX = 70;

/**
 * Basal metabolic rate.
 *
 * With a body fat estimate, Katch-McArdle on lean mass (370 + 21.6·LBM);
 * knowing composition beats guessing it from sex and age. Otherwise
 * Mifflin-St Jeor:
 * male:   10w + 6.25h - 5a + 5
 * female: 10w + 6.25h - 5a - 161
 * other:  midpoint of the two constants (-78)
 */
export function bmr(
  sex: Sex,
  age: number,
  heightCm: number,
  weightKg: number,
  bodyFatPct?: number | null,
): Reasoned<number> {
  if (age <= 0 || heightCm <= 0 || weightKg <= 0) {
    throw new Error("bmr: age, height, and weight must be positive");
  }

  if (
    typeof bodyFatPct === "number" &&
    Number.isFinite(bodyFatPct) &&
    bodyFatPct >= BODY_FAT_MIN &&
    bodyFatPct <= BODY_FAT_MAX
  ) {
    const leanMassKg = Number((weightKg * (1 - bodyFatPct / 100)).toFixed(1));
    const value = Math.round(370 + 21.6 * leanMassKg);
    return {
      value,
      reasoning: {
        rule: "katch_mcardle",
        inputs: { sex, age, heightCm, weightKg, bodyFatPct, leanMassKg },
        explanation: `Your body burns roughly ${value} kcal/day at complete rest, estimated from your lean mass (about ${leanMassKg} kg at ${bodyFatPct}% body fat) using the Katch-McArdle equation.`,
      },
    };
  }

  const constant = sex === "male" ? 5 : sex === "female" ? -161 : -78;
  const value = Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + constant);

  return {
    value,
    reasoning: {
      rule: "mifflin_st_jeor",
      inputs: { sex, age, heightCm, weightKg, constant },
      explanation: `Your body burns roughly ${value} kcal/day at complete rest, estimated from your weight, height, age, and sex using the Mifflin-St Jeor equation.`,
    },
  };
}
