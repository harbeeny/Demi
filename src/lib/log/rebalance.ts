// Pure rebalance math for re-targeting the unlogged, upcoming meal slots.
// Client-importable: no "server-only".

import type { SlotTarget } from "@/lib/nutrition";
import type { MacroTotals } from "./remaining";

/** kcal gap below which a rebalance is not worth offering. */
const MIN_KCAL_GAP = 100;
/** ...or 10% of what the upcoming meals were planned to carry. */
const KCAL_GAP_FRACTION = 0.1;
/** protein gap that justifies a rebalance on its own. */
const PROTEIN_GAP_G = 15;

/**
 * The weekly-balance flow silences this heuristic for the day: a big-night
 * entry documents a night that already happened, an applied balance means
 * the day is settled, and a trim from last night's balance is deliberately
 * small enough not to notice. Offering to shrink the remaining meals in
 * response to any of them is the compensatory move the balance feature
 * exists to prevent (SAFETY.md), so the two systems never stack prompts.
 */
export function balanceQuietsRebalance(day: {
  hasBigNightEntry: boolean;
  balancedToday: boolean;
  trimmedByYesterday: boolean;
}): boolean {
  return day.hasBigNightEntry || day.balancedToday || day.trimmedByYesterday;
}

/**
 * Offer a rebalance only when what's left in the budget meaningfully differs
 * from what the remaining planned meals would deliver.
 */
export function shouldOfferRebalance(
  remaining: MacroTotals,
  upcomingPlanned: MacroTotals,
  upcomingSlotCount: number,
): boolean {
  if (upcomingSlotCount === 0 || remaining.kcal <= 0) return false;
  const kcalGap = Math.abs(remaining.kcal - upcomingPlanned.kcal);
  const proteinGap = Math.abs(remaining.proteinG - upcomingPlanned.proteinG);
  return kcalGap > Math.max(MIN_KCAL_GAP, KCAL_GAP_FRACTION * upcomingPlanned.kcal) ||
    proteinGap > PROTEIN_GAP_G;
}

/**
 * Rescale the upcoming slots to fit the remaining budget, preserving each
 * slot's share of the original upcoming group (snacks stay snack-sized).
 * Protein is split evenly, macros clamp at zero, kcal is recomputed from
 * macros so the numbers stay internally consistent.
 */
export function rebalanceSlotTargets(
  remaining: MacroTotals,
  upcomingSlots: SlotTarget[],
): SlotTarget[] {
  if (upcomingSlots.length === 0) return [];

  const groupKcal = upcomingSlots.reduce((a, s) => a + s.kcal, 0);
  const proteinEach = Math.max(0, remaining.proteinG) / upcomingSlots.length;

  return upcomingSlots.map((slot) => {
    const share = groupKcal > 0 ? slot.kcal / groupKcal : 1 / upcomingSlots.length;
    const carbsG = Math.max(0, Math.round(remaining.carbsG * share));
    const fatG = Math.max(0, Math.round(remaining.fatG * share));
    const proteinG = Math.round(proteinEach);
    return {
      ...slot,
      proteinG,
      carbsG,
      fatG,
      kcal: proteinG * 4 + carbsG * 4 + fatG * 9,
      reasoning: {
        rule: "rebalance_remaining",
        inputs: {
          remainingKcal: Math.round(remaining.kcal),
          remainingProteinG: Math.round(remaining.proteinG),
          slotShare: Number(share.toFixed(2)),
        },
        explanation:
          "Re-sized to fit what's left of today's budget, keeping this meal's share of the remaining slots.",
      },
    };
  });
}
