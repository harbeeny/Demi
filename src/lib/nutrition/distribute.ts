import type { MealSlot } from "@/lib/supabase/types";
import type { MacroTargets, ProfileInput, SlotTarget } from "./types";

export const SLOT_SEQUENCES: Record<number, MealSlot[]> = {
  1: ["dinner"],
  2: ["lunch", "dinner"],
  3: ["breakfast", "lunch", "dinner"],
  4: ["breakfast", "lunch", "snack", "dinner"],
  5: ["breakfast", "snack", "lunch", "snack", "dinner"],
  6: ["breakfast", "snack", "lunch", "snack", "dinner", "snack"],
};

/** Snacks get a smaller share; main meals split the rest evenly. */
const SNACK_SHARE = 0.12;

/** Extra share of daily carbs shifted toward the meal nearest training. */
const TRAINING_CARB_SHIFT = 0.15;

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function parseTimeToHour(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h + (m ?? 0) / 60;
}

/**
 * Spread daily targets across meals_per_day within the eating window.
 * - Meal times are evenly spaced from window start to window end.
 * - Protein is spread evenly across ALL meals (muscle protein synthesis
 *   responds to repeated doses, not one big bolus).
 * - On a training day with a known time, the meal nearest the session
 *   carries extra carbs, taken proportionally from the others.
 */
export function distribute(
  targets: MacroTargets,
  profile: ProfileInput,
  /** date used to decide whether today is a training day */
  today: Date,
): SlotTarget[] {
  const slots = SLOT_SEQUENCES[profile.mealsPerDay];
  if (!slots) throw new Error(`distribute: unsupported meals_per_day ${profile.mealsPerDay}`);

  const n = slots.length;
  const windowStart = profile.eatingWindowStart;
  const windowEnd = profile.eatingWindowEnd;
  const span = windowEnd - windowStart;

  // Evenly spaced times; single meal sits mid-window.
  const times = slots.map((_, i) => (n === 1 ? windowStart + span / 2 : windowStart + (span * i) / (n - 1)));

  // Share of kcal/carbs/fat per slot: snacks small, mains equal.
  const snackCount = slots.filter((s) => s === "snack").length;
  const mainCount = n - snackCount;
  const mainShare = (1 - snackCount * SNACK_SHARE) / mainCount;
  const shares = slots.map((s) => (s === "snack" ? SNACK_SHARE : mainShare));

  // Protein is even across all meals regardless of slot size.
  const proteinPerMeal = targets.proteinG.value / n;

  // Training-aware carb shift
  const isTrainingDay =
    profile.trainingDays.map((d) => d.toLowerCase()).includes(WEEKDAYS[today.getDay()]) &&
    profile.trainingTime !== null;
  let trainingNearestIndex = -1;
  if (isTrainingDay && profile.trainingTime) {
    const trainHour = parseTimeToHour(profile.trainingTime);
    let best = Infinity;
    times.forEach((t, i) => {
      const dist = Math.abs(t - trainHour);
      if (dist < best) {
        best = dist;
        trainingNearestIndex = i;
      }
    });
  }

  const totalCarbs = targets.carbsG.value;
  const carbShift = trainingNearestIndex >= 0 ? totalCarbs * TRAINING_CARB_SHIFT : 0;

  return slots.map((slot, i) => {
    const share = shares[i];
    let carbs = totalCarbs * share;
    if (trainingNearestIndex >= 0) {
      carbs = i === trainingNearestIndex
        ? carbs + carbShift
        : carbs - carbShift / (n - 1);
    }
    const fat = targets.fatG.value * share;
    const protein = proteinPerMeal;
    const kcal = Math.round(protein * 4 + carbs * 4 + fat * 9);

    const timeLabel = `${Math.floor(times[i])}:${String(Math.round((times[i] % 1) * 60)).padStart(2, "0")}`;

    return {
      slot,
      timeHour: times[i],
      kcal,
      proteinG: Math.round(protein),
      carbsG: Math.max(0, Math.round(carbs)),
      fatG: Math.round(fat),
      reasoning: {
        rule: i === trainingNearestIndex ? "training_adjacent_carbs" : "even_distribution",
        inputs: {
          slot,
          share: Number(share.toFixed(3)),
          timeHour: Number(times[i].toFixed(2)),
          isTrainingDay,
          trainingNearest: i === trainingNearestIndex,
        },
        explanation:
          i === trainingNearestIndex
            ? `This meal sits closest to your training session, so it carries extra carbs to fuel and recover from the work.`
            : `Scheduled around ${timeLabel} to space your meals evenly through your eating window, with protein in every meal to keep muscle building steady.`,
      },
    };
  });
}
