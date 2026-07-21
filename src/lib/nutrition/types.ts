import type { ActivityLevel, Goal, MealSlot, Sex } from "@/lib/supabase/types";

/**
 * Every nutrition output carries a machine-readable reasoning object so the
 * UI and the LLM can both explain *why* a number is what it is.
 */
export interface Reasoning {
  rule: string;
  inputs: Record<string, string | number | boolean | null>;
  explanation: string;
}

export interface Reasoned<T> {
  value: T;
  reasoning: Reasoning;
}

export interface ProfileInput {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  goal: Goal;
  /** self-assessed body fat %, 3-70; null/absent falls back to Mifflin-St Jeor */
  bodyFatPct?: number | null;
  /** protein tier preference; null/absent behaves as "moderate" */
  proteinPref?: "low" | "moderate" | "high" | "extra_high" | null;
  /** kg per week; null uses the default rate for the goal */
  goalRate: number | null;
  activityLevel: ActivityLevel;
  mealsPerDay: number;
  eatingWindowStart: number; // hour 0-23
  eatingWindowEnd: number; // hour 1-24, > start
  /** lowercase weekday names, e.g. ["monday","thursday"] */
  trainingDays: string[];
  /** "HH:MM" 24h, or null if the user doesn't train at a set time */
  trainingTime: string | null;
  /** accepted adaptive correction to estimated TDEE, kcal/day; null/absent = none */
  tdeeCorrection?: number | null;
}

export interface MacroTargets {
  kcal: Reasoned<number>;
  proteinG: Reasoned<number>;
  fatG: Reasoned<number>;
  carbsG: Reasoned<number>;
  fiberG: Reasoned<number>;
  /** present only when a non-zero adaptive correction was applied */
  tdeeCorrection: Reasoned<number> | null;
  /** true when the safety floor overrode the requested deficit */
  flooredBySafety: boolean;
  /** true when age < 18 forced maintenance */
  minorMaintenanceApplied: boolean;
  /** true when the requested loss rate exceeded 1% bodyweight/week and was slowed */
  rateCappedBySafety: boolean;
  /** true when BMI < 18.5 converted a fat-loss goal to maintenance */
  underweightMaintenanceApplied: boolean;
}

export interface SlotTarget {
  slot: MealSlot;
  /** hour of day as decimal, e.g. 12.5 = 12:30 */
  timeHour: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  reasoning: Reasoning;
}
