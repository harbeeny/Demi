import type { Sex } from "@/lib/supabase/types";
import type { Reasoned } from "./types";

/**
 * Basal metabolic rate via Mifflin-St Jeor.
 * male:   10w + 6.25h - 5a + 5
 * female: 10w + 6.25h - 5a - 161
 * other:  midpoint of the two constants (-78)
 */
export function bmr(sex: Sex, age: number, heightCm: number, weightKg: number): Reasoned<number> {
  if (age <= 0 || heightCm <= 0 || weightKg <= 0) {
    throw new Error("bmr: age, height, and weight must be positive");
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
