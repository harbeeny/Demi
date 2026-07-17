"use client";

import { useEffect, useRef, useState } from "react";

import { formatQty, type Ingredient } from "@/lib/plan/grocery";
import { useSwipeToDismiss } from "@/components/today/useSwipeToDismiss";

export interface RecipeData {
  name: string;
  servings: number;
  prepMin: number;
  cookMin: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  ingredients: Ingredient[];
  instructions: string[];
  source: string;
}

/** Single footer action; the opener decides what the scroll should end in. */
export interface RecipeAction {
  label: string;
  busyLabel?: string;
  doneLabel?: string;
  done?: boolean;
  run: () => void | Promise<void>;
}

interface Props {
  recipe: RecipeData | null;
  action?: RecipeAction | null;
  onClose: () => void;
}

/**
 * Bottom sheet showing a meal's recipe. Shared by Kitchen and Today, with the
 * same physics the log sheet taught: grab handle, swipe-down to dismiss,
 * slide-in/out. Steps check off as you cook, and the scroll ends in an action.
 */
export function RecipeSheet({ recipe, action = null, onClose }: Props) {
  const open = recipe !== null;
  const { sheetRef, scrollRef, mounted, sheetStyle, backdropStyle, handlers } =
    useSwipeToDismiss(open, onClose);

  // Keep the last recipe through the exit animation, and reset the cooking
  // check-offs whenever the sheet (re)opens.
  const lastRecipe = useRef<RecipeData | null>(null);
  if (recipe) lastRecipe.current = recipe;
  const shown = recipe ?? lastRecipe.current;

  const [doneSteps, setDoneSteps] = useState<Set<number>>(new Set());
  const [actionBusy, setActionBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setDoneSteps(new Set());
      setActionBusy(false);
    }
  }, [open]);

  if (!mounted || !shown) return null;

  const toggleStep = (i: number) =>
    setDoneSteps((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const runAction = async () => {
    if (!action || actionBusy || action.done) return;
    setActionBusy(true);
    try {
      await action.run();
    } finally {
      setActionBusy(false);
    }
  };

  const macros: Array<[string, number]> = [
    ["kcal", shown.kcal],
    ["Protein", shown.proteinG],
    ["Carbs", shown.carbsG],
    ["Fat", shown.fatG],
  ];

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      style={backdropStyle}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        className="flex h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-(--bg) shadow-[var(--shadow-sheet)]"
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
        {...handlers}
      >
        <div data-drag-handle className="shrink-0 px-5 pt-3" style={{ touchAction: "none" }}>
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-(--handle)" aria-hidden="true" />
          <div className="mb-3 flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold leading-snug text-(--ink)">{shown.name}</h2>
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
          <p className="mb-3 text-xs text-(--ink-2)">
            Prep {shown.prepMin} min · Cook {shown.cookMin} min
            {shown.servings !== 1 ? ` · ${shown.servings} servings` : ""}
          </p>

          <div className="mb-4 grid grid-cols-4 gap-2">
            {macros.map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-(--surface) p-2.5 text-center shadow-sm">
                <p className="text-sm font-semibold text-(--ink)">
                  {Math.round(value)}
                  {label !== "kcal" ? "g" : ""}
                </p>
                <p className="text-[10px] text-(--muted)">{label}</p>
              </div>
            ))}
          </div>

          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-(--muted)">
            Ingredients
          </h3>
          <ul className="mb-4 space-y-1.5 rounded-2xl bg-(--surface) p-4 shadow-sm">
            {shown.ingredients.map((ing) => (
              <li
                key={`${ing.item}-${ing.unit}`}
                className="flex justify-between gap-3 text-sm text-(--ink)"
              >
                <span>{ing.item}</span>
                <span className="shrink-0 text-(--ink-2)">
                  {formatQty(ing.qty * shown.servings, ing.unit)}
                </span>
              </li>
            ))}
          </ul>

          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-(--muted)">Steps</h3>
          <ol className="mb-4 space-y-1 rounded-2xl bg-(--surface) p-3 shadow-sm">
            {shown.instructions.map((step, i) => {
              const done = doneSteps.has(i);
              return (
                <li key={i}>
                  <button
                    onClick={() => toggleStep(i)}
                    aria-pressed={done}
                    className="press flex w-full items-start gap-3 rounded-xl p-2 text-left"
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                        done
                          ? "border-(--accent-deep) bg-(--accent-deep) text-(--ink-contrast)"
                          : "border-(--border) text-(--ink-2)"
                      }`}
                    >
                      {done ? "✓" : i + 1}
                    </span>
                    <span
                      className={`text-sm leading-6 ${
                        done ? "text-(--muted) line-through" : "text-(--ink)"
                      }`}
                    >
                      {step}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          {action && (
            <button
              onClick={() => void runAction()}
              disabled={actionBusy || action.done}
              className={`press mb-3 w-full rounded-2xl px-5 py-3 font-medium ${
                action.done
                  ? "bg-(--tint) text-(--tint-ink)"
                  : "bg-(--ink) text-(--ink-contrast) disabled:opacity-60"
              }`}
            >
              {action.done
                ? (action.doneLabel ?? "Done")
                : actionBusy
                  ? (action.busyLabel ?? "Working...")
                  : action.label}
            </button>
          )}

          <p className="text-xs leading-5 text-(--muted)">{shown.source}</p>
        </div>
      </div>
    </div>
  );
}
