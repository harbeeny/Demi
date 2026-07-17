"use client";

import { device24HourClock, formatTimeHour } from "@/lib/dates";
import type { RecipeData } from "@/components/kitchen/RecipeSheet";

export interface TodayMeal {
  slotIndex: number;
  slot: string;
  timeHour: number;
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  why: string;
  /** present once the meal has recipe content */
  recipe?: RecipeData;
}

export function timeLabel(timeHour: number): string {
  return formatTimeHour(timeHour, device24HourClock());
}

// Renders only unconfirmed suggestions: once eaten, MealSection collapses
// the suggestion into its logged row (which owns Undo), so this card has
// no logged state.
interface Props {
  meal: TodayMeal;
  busy: string | null;
  /** section already names the slot and time, so the card header hides */
  compact?: boolean;
  onConfirm: (slotIndex: number) => void;
  onSwap: (slotIndex: number) => void;
  onRecipe: (recipe: NonNullable<TodayMeal["recipe"]>, slotIndex: number) => void;
}

export function MealCard({ meal, busy, compact = false, onConfirm, onSwap, onRecipe }: Props) {
  return (
    <article className="relative rounded-3xl bg-(--surface) p-4 shadow-sm">
      <span className="block text-xs font-medium uppercase tracking-wide text-(--muted)">
        {compact ? "Suggested" : `${meal.slot} · ${timeLabel(meal.timeHour)}`}
      </span>
      <h2 className="mt-1 font-medium text-(--ink)">{meal.name}</h2>
      <div className="mt-2 flex gap-3 text-xs text-(--ink-2)">
        <span>{Math.round(meal.kcal)} kcal</span>
        <span>P {Math.round(meal.proteinG)}g</span>
        <span>C {Math.round(meal.carbsG)}g</span>
        <span>F {Math.round(meal.fatG)}g</span>
      </div>
      {meal.why && <p className="mt-2 text-sm leading-5 text-(--ink-2)">{meal.why}</p>}
      {/* One action row, one control vocabulary: quiet pills lead, the
          primary holds the right edge. The old header text links read as
          tags, not controls. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {meal.recipe && meal.recipe.instructions.length > 0 && (
          <button
            onClick={() => onRecipe(meal.recipe!, meal.slotIndex)}
            disabled={busy !== null}
            className="press rounded-full border border-(--border) bg-(--surface) px-3 py-2 text-xs text-(--ink) hover:border-(--accent) disabled:opacity-50"
          >
            Recipe
          </button>
        )}
        <button
          onClick={() => onSwap(meal.slotIndex)}
          disabled={busy !== null}
          className="press rounded-full border border-(--border) bg-(--surface) px-3 py-2 text-xs text-(--ink) hover:border-(--accent) disabled:opacity-50"
        >
          {busy === `swap-${meal.slotIndex}` ? "Swapping..." : "Swap"}
        </button>
        <button
          onClick={() => onConfirm(meal.slotIndex)}
          disabled={busy !== null}
          className="press ml-auto rounded-full border border-(--border) bg-(--surface) px-4 py-2 text-sm text-(--ink) hover:border-(--accent) disabled:opacity-50"
        >
          {busy === `log-${meal.slotIndex}` ? "Logging..." : "I ate this"}
        </button>
      </div>
    </article>
  );
}
