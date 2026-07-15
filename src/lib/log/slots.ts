import type { MealSlot } from "@/lib/supabase/types";

export const SLOT_ORDER: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

export const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

/**
 * Default meal section for a log happening right now, from the local clock.
 * Only a starting point: every log flow lets the user pick.
 */
export function suggestSlot(hour: number, minute = 0): MealSlot {
  const h = hour + minute / 60;
  if (h < 10.5) return "breakfast";
  if (h < 14.5) return "lunch";
  if (h < 17) return "snack";
  return "dinner";
}
