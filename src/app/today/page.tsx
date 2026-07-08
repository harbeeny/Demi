import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { targets } from "@/lib/nutrition";
import { profileFromRow } from "@/lib/plan/generate";
import type { MealPlanEntry } from "@/lib/supabase/types";
import { TodayView, type TodayMeal } from "@/components/today/TodayView";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: onboarding } = await supabase
    .from("onboarding_answers")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!onboarding) redirect("/onboarding");

  const dayTargets = targets(profileFromRow(onboarding));

  const today = new Date().toISOString().slice(0, 10);
  const { data: planRow } = await supabase
    .from("meal_plans")
    .select("llm_rationale, meals")
    .eq("user_id", user.id)
    .eq("date", today)
    .single();

  let mealsData: TodayMeal[] = [];
  let daySummary = "";

  if (planRow) {
    const entries = planRow.meals as MealPlanEntry[];
    const ids = entries.map((e) => e.meal_id);
    const { data: mealRows } = await supabase.from("meals").select("*").in("id", ids);
    const byId = new Map((mealRows ?? []).map((m) => [m.id, m]));

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
        },
      ];
    });
    daySummary = planRow.llm_rationale;
  }

  return (
    <TodayView
      hasPlan={planRow !== null && mealsData.length > 0}
      daySummary={daySummary}
      meals={mealsData}
      targets={{
        kcal: dayTargets.kcal.value,
        proteinG: dayTargets.proteinG.value,
        carbsG: dayTargets.carbsG.value,
        fatG: dayTargets.fatG.value,
      }}
    />
  );
}
