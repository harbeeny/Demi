import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { targets } from "@/lib/nutrition";
import { profileFromRow, prefsFromRow } from "@/lib/plan/generate";
import { isEligible, type Meal } from "@/lib/plan/select-meals";
import type { MealPlanEntry } from "@/lib/supabase/types";
import { TodayView, type TodayMeal, type TodayLog } from "@/components/today/TodayView";
import type { DaySummary } from "@/components/today/SummaryCard";

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

  const dayTargets = targets(profileFromRow(onboarding), { displayUnits: "us" });

  const today = new Date().toISOString().slice(0, 10);
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
        .select("id, slot, plan_slot_index, name, kcal, protein_g, carbs_g, fat_g, source")
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
        },
      ];
    });
    daySummary = planRow.llm_rationale;
  }

  const logs: TodayLog[] = (logRows ?? []).map((l) => ({
    id: l.id,
    slot: l.slot,
    planSlotIndex: l.plan_slot_index,
    name: l.name,
    kcal: Number(l.kcal),
    proteinG: Number(l.protein_g),
    carbsG: Number(l.carbs_g),
    fatG: Number(l.fat_g),
    source: l.source,
  }));

  const summary: DaySummary | null =
    dailyLog && dailyLog.finished_at && dailyLog.reflection && dailyLog.tweak
      ? {
          reflection: dailyLog.reflection,
          tweak: dailyLog.tweak,
          finishedAt: dailyLog.finished_at,
          energy: dailyLog.energy,
        }
      : null;

  // The whole meal DB is 40 rows; ship the eligible subset for client search.
  const prefs = prefsFromRow(onboarding);
  const searchMeals = ((allMeals ?? []) as Meal[])
    .filter((m) => isEligible(m, prefs))
    .map((m) => ({
      id: m.id,
      name: m.name,
      kcal: Number(m.kcal),
      proteinG: Number(m.protein_g),
      carbsG: Number(m.carbs_g),
      fatG: Number(m.fat_g),
    }));

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
      logs={logs}
      summary={summary}
      searchMeals={searchMeals}
    />
  );
}
