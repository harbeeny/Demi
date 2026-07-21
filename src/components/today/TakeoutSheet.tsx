"use client";

import { useRef, useState } from "react";

import { tapHaptic } from "@/lib/haptics";
import { TAKEOUT_PROVIDERS } from "@/lib/takeout/deeplinks";
import { hasPublishedNutrition } from "@/lib/takeout/macro-match";
import { recordAndOpenTakeout } from "@/lib/takeout/intent";
import type { Goal, TakeoutProvider, TakeoutSurface } from "@/lib/supabase/types";
import { useSwipeToDismiss } from "./useSwipeToDismiss";
import type { TodayMeal } from "./MealCard";

interface Props {
  /** the meal being ordered; null closes the sheet */
  meal: TodayMeal | null;
  goal: Goal | null;
  surface: TakeoutSurface;
  onClose: () => void;
}

/**
 * Takeout fake-door handoff sheet: two provider rows that deep-link to that
 * app's search for the dish. Demand measurement only; the tap is logged and
 * the order happens entirely in the delivery app, and the copy says so.
 * The macro badge is honest by design (SAFETY.md: never show a nutrition
 * number we can't source): without published data for the restaurant's
 * version of the dish, macros are labeled estimated, never "fits".
 */
export function TakeoutSheet({ meal, goal, surface, onClose }: Props) {
  const open = meal !== null;
  const { sheetRef, scrollRef, mounted, sheetStyle, backdropStyle, handlers } =
    useSwipeToDismiss(open, onClose);

  // Keep the last meal through the exit animation (RecipeSheet pattern).
  const lastMeal = useRef<TodayMeal | null>(null);
  if (meal) lastMeal.current = meal;
  const shown = meal ?? lastMeal.current;

  const [opening, setOpening] = useState<TakeoutProvider | null>(null);

  if (!mounted || !shown) return null;

  const fits = hasPublishedNutrition({ name: shown.name, mealId: shown.mealId });

  const order = async (provider: TakeoutProvider) => {
    if (opening) return;
    tapHaptic();
    setOpening(provider);
    try {
      await recordAndOpenTakeout({
        provider,
        mealId: shown.mealId,
        dishQuery: shown.name,
        hadMacroMatch: fits,
        goal,
        surface,
      });
    } finally {
      setOpening(null);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      style={backdropStyle}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        className="flex max-h-[80dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-(--bg) shadow-[var(--shadow-sheet)]"
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
        {...handlers}
      >
        <div data-drag-handle className="shrink-0 px-5 pt-3" style={{ touchAction: "none" }}>
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-(--handle)" aria-hidden="true" />
          <div className="mb-1 flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold leading-snug text-(--ink)">Order this meal</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="press -mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-(--muted) hover:bg-(--track) hover:text-(--ink)"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-5 pb-8"
          style={{ touchAction: "pan-y", overscrollBehavior: "contain" }}
        >
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-(--ink)">
            <span>{shown.name}</span>
            {fits ? (
              <span className="shrink-0 rounded-full bg-(--tint) px-2 py-0.5 text-[10px] text-(--tint-ink)">
                ≈ fits your macros
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-(--warn-bg) px-2 py-0.5 text-[10px] text-(--warn-ink)">
                macros estimated
              </span>
            )}
          </p>
          <p className="mt-2 text-xs leading-5 text-(--muted)">
            Demi opens the delivery app&apos;s search for this dish, and the order happens
            there. Restaurant versions vary, so treat the macros as estimates.
          </p>

          <div className="mt-4 space-y-2">
            {TAKEOUT_PROVIDERS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => void order(id)}
                disabled={opening !== null}
                className="press flex w-full items-center justify-between rounded-2xl border border-(--border) bg-(--surface) px-4 py-3 text-sm font-medium text-(--ink) hover:border-(--accent) disabled:opacity-50"
              >
                {opening === id ? `Opening ${label}...` : `Open ${label}`}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="shrink-0 text-(--muted)"
                >
                  <path d="M7 7h10v10" />
                  <path d="M7 17 17 7" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
