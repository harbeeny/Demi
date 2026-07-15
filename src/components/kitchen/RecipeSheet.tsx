"use client";

import { formatQty, type Ingredient } from "@/lib/plan/grocery";

export interface RecipeData {
  name: string;
  servings: number;
  prepMin: number;
  cookMin: number;
  kcal: number;
  proteinG: number;
  ingredients: Ingredient[];
  instructions: string[];
  source: string;
}

interface Props {
  recipe: RecipeData | null;
  onClose: () => void;
}

/** Bottom sheet showing a meal's recipe. Shared by Kitchen and Today. */
export function RecipeSheet({ recipe, onClose }: Props) {
  if (!recipe) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30" onClick={onClose}>
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[#f4f6f2] p-5 pb-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold leading-snug text-[#2c3a2e]">{recipe.name}</h2>
          <button onClick={onClose} className="shrink-0 text-sm text-[#829084] hover:text-[#2c3a2e]">
            Close
          </button>
        </div>

        <p className="mb-4 text-xs text-[#5d6b5f]">
          Prep {recipe.prepMin} min · Cook {recipe.cookMin} min · {Math.round(recipe.kcal)} kcal · P{" "}
          {Math.round(recipe.proteinG)}g
          {recipe.servings !== 1 ? ` · ${recipe.servings} servings` : ""}
        </p>

        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-[#829084]">
          Ingredients
        </h3>
        <ul className="mb-4 space-y-1.5 rounded-2xl bg-white p-4 shadow-sm">
          {recipe.ingredients.map((ing) => (
            <li key={`${ing.item}-${ing.unit}`} className="flex justify-between gap-3 text-sm text-[#2c3a2e]">
              <span>{ing.item}</span>
              <span className="shrink-0 text-[#5d6b5f]">
                {formatQty(ing.qty * recipe.servings, ing.unit)}
              </span>
            </li>
          ))}
        </ul>

        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-[#829084]">Steps</h3>
        <ol className="mb-4 list-decimal space-y-2 rounded-2xl bg-white p-4 pl-9 text-sm leading-6 text-[#2c3a2e] shadow-sm">
          {recipe.instructions.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>

        <p className="text-xs leading-5 text-[#829084]">{recipe.source}</p>
      </div>
    </div>
  );
}
