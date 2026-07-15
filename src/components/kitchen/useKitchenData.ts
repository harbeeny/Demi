"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { weekDates } from "@/lib/plan/week";
import type { Ingredient } from "@/lib/plan/grocery";
import type { Budget, MealPlanEntry, MealSlot } from "@/lib/supabase/types";
import { localDateISO } from "@/lib/dates";

export interface KitchenMeal {
  mealId: string;
  name: string;
  slot: MealSlot;
  servings: number;
  timeHour: number;
  kcal: number;
  proteinG: number;
  prepMin: number;
  cookMin: number;
  ingredients: Ingredient[];
  instructions: string[];
  source: string;
}

export interface KitchenDay {
  date: string;
  entries: KitchenMeal[];
}

export interface KitchenData {
  days: KitchenDay[]; // always 7; entries empty when unplanned
  budget: Budget;
}

/** Client data for the Kitchen tab; guards auth/onboarding like useTodayData. */
export function useKitchenData(): {
  loading: boolean;
  data: KitchenData | null;
  reload: () => Promise<void>;
} {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<KitchenData | null>(null);

  const reload = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/login");
      return;
    }

    const { data: onboarding } = await supabase
      .from("onboarding_answers")
      .select("budget")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (!onboarding) {
      router.replace("/onboarding");
      return;
    }

    const dates = weekDates(localDateISO());
    const [{ data: planRows }, { data: mealRows }] = await Promise.all([
      supabase
        .from("meal_plans")
        .select("date, meals")
        .eq("user_id", user.id)
        .gte("date", dates[0])
        .lte("date", dates[6]),
      supabase.from("meals").select("*"),
    ]);

    const byId = new Map((mealRows ?? []).map((m) => [m.id, m]));
    const plansByDate = new Map((planRows ?? []).map((p) => [p.date, p.meals as MealPlanEntry[]]));

    const days: KitchenDay[] = dates.map((date) => ({
      date,
      entries: (plansByDate.get(date) ?? []).flatMap((e): KitchenMeal[] => {
        const meal = byId.get(e.meal_id);
        if (!meal) return [];
        return [
          {
            mealId: meal.id,
            name: meal.name,
            slot: e.slot,
            servings: e.servings,
            timeHour: e.time_hour ?? 12,
            kcal: Number(meal.kcal),
            proteinG: Number(meal.protein_g),
            prepMin: Number(meal.prep_min),
            cookMin: Number(meal.cook_min),
            ingredients: (meal.ingredients as unknown as Ingredient[]) ?? [],
            instructions: meal.instructions ?? [],
            source: meal.source,
          },
        ];
      }),
    }));

    setData({ days, budget: onboarding.budget });
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { loading, data, reload };
}
