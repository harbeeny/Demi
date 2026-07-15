"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { registerPush } from "@/lib/push";
import { deviceTimeZone, localDateISO } from "@/lib/dates";
import { targets } from "@/lib/nutrition";
import { profileFromRow, prefsFromRow } from "@/lib/plan/rows";
import { isEligible, type Meal } from "@/lib/plan/select-meals";
import type { MealPlanEntry } from "@/lib/supabase/types";
import type { Ingredient } from "@/lib/plan/grocery";
import type { MacroTotals } from "@/lib/log/remaining";
import type { TodayMeal, TodayLog } from "./TodayView";
import type { DaySummary } from "./SummaryCard";
import type { SearchMeal } from "./LogSheet";

export interface TodayData {
  hasPlan: boolean;
  daySummary: string;
  meals: TodayMeal[];
  targets: MacroTotals;
  logs: TodayLog[];
  summary: DaySummary | null;
  searchMeals: SearchMeal[];
}

/**
 * Client-side data loading for the Today screen. Replaces the former server
 * component so the same page runs in the Capacitor shell (no server there).
 * All queries are RLS-scoped table reads; unauthenticated or un-onboarded
 * visitors are routed away, mirroring what the middleware does on the web.
 */
export function useTodayData(): { loading: boolean; data: TodayData | null; reload: () => Promise<void> } {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TodayData | null>(null);
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
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!onboarding) {
      router.replace("/onboarding");
      return;
    }

    // Signed-in and onboarded: this is the moment to ask for push (native only).
    void registerPush();

    // The app's day follows the device clock; keep the profile's timezone
    // fresh so the server (routes, meal reminders) resolves the same day.
    const tz = deviceTimeZone();
    if (tz) {
      // or-filter because a NULL timezone would never match a plain neq
      void supabase
        .from("profiles")
        .update({ timezone: tz })
        .eq("id", user.id)
        .or(`timezone.neq.${tz},timezone.is.null`)
        .then(() => undefined);
    }

    const today = localDateISO();
    const [{ data: planRow }, { data: logRows }, { data: dailyLog }, { data: allMeals }] =
      await Promise.all([
        supabase
          .from("meal_plans")
          .select("llm_rationale, meals")
          .eq("user_id", user.id)
          .eq("date", today)
          .single(),
        supabase
          .from("meal_logs")
          .select("id, slot, plan_slot_index, name, kcal, protein_g, carbs_g, fat_g, source, verified")
          .eq("user_id", user.id)
          .eq("date", today)
          .order("logged_at", { ascending: true }),
        supabase
          .from("daily_logs")
          .select("reflection, tweak, finished_at, energy")
          .eq("user_id", user.id)
          .eq("date", today)
          .single(),
        supabase.from("meals").select("*"),
      ]);

    const dayTargets = targets(profileFromRow(onboarding), { displayUnits: "us" });

    let mealsData: TodayMeal[] = [];
    let daySummary = "";
    if (planRow) {
      const entries = planRow.meals as MealPlanEntry[];
      const ids = entries.map((e) => e.meal_id);
      const byId = new Map((allMeals ?? []).filter((m) => ids.includes(m.id)).map((m) => [m.id, m]));
      mealsData = entries.flatMap((e, i): TodayMeal[] => {
        const meal = byId.get(e.meal_id);
        if (!meal) return [];
        return [
          {
            slotIndex: i,
            slot: e.slot,
            timeHour: e.time_hour ?? 12,
            name: meal.name,
            kcal: Number(meal.kcal),
            proteinG: Number(meal.protein_g),
            carbsG: Number(meal.carbs_g),
            fatG: Number(meal.fat_g),
            why: e.why ?? "",
            recipe: {
              name: meal.name,
              servings: e.servings,
              prepMin: Number(meal.prep_min),
              cookMin: Number(meal.cook_min),
              kcal: Number(meal.kcal),
              proteinG: Number(meal.protein_g),
              ingredients: (meal.ingredients as unknown as Ingredient[]) ?? [],
              instructions: meal.instructions ?? [],
              source: meal.source,
            },
          },
        ];
      });
      daySummary = planRow.llm_rationale;
    }

    const prefs = prefsFromRow(onboarding);

    setData({
      hasPlan: planRow !== null && mealsData.length > 0,
      daySummary,
      meals: mealsData,
      targets: {
        kcal: dayTargets.kcal.value,
        proteinG: dayTargets.proteinG.value,
        carbsG: dayTargets.carbsG.value,
        fatG: dayTargets.fatG.value,
      },
      logs: (logRows ?? []).map((l) => ({
        id: l.id,
        slot: l.slot,
        planSlotIndex: l.plan_slot_index,
        name: l.name,
        kcal: Number(l.kcal),
        proteinG: Number(l.protein_g),
        carbsG: Number(l.carbs_g),
        fatG: Number(l.fat_g),
        source: l.source,
        verified: l.verified === true,
      })),
      summary:
        dailyLog && dailyLog.finished_at && dailyLog.reflection && dailyLog.tweak
          ? {
              reflection: dailyLog.reflection,
              tweak: dailyLog.tweak,
              finishedAt: dailyLog.finished_at,
              energy: dailyLog.energy,
            }
          : null,
      // The whole meal DB is ~50 rows; ship the eligible subset for search.
      searchMeals: ((allMeals ?? []) as Meal[]).filter((m) => isEligible(m, prefs)).map((m) => ({
        id: m.id,
        name: m.name,
        kcal: Number(m.kcal),
        proteinG: Number(m.protein_g),
        carbsG: Number(m.carbs_g),
        fatG: Number(m.fat_g),
      })),
    });
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { loading, data, reload };
}
