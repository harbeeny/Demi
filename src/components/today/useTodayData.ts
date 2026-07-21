"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { registerPush } from "@/lib/push";
import { device24HourClock, deviceTimeZone, localDateISO } from "@/lib/dates";
import { loggingStreak, trailingDates } from "@/lib/log/streak";
import { calorieFloor, targets } from "@/lib/nutrition";
import { addDaysISO, applyKcalDelta } from "@/lib/log/balance";
import { profileFromRow, prefsFromRow } from "@/lib/plan/rows";
import { shiftDeltaFor } from "@/lib/plan/shift";
import { isEligible, type Meal } from "@/lib/plan/select-meals";
import { readSnapshot, writeSnapshot } from "@/lib/tab-cache";
import type { Goal, MealPlanEntry } from "@/lib/supabase/types";
import type { Ingredient } from "@/lib/plan/grocery";
import type { MacroTotals } from "@/lib/log/remaining";
import type { TodayMeal, TodayLog } from "./TodayView";
import type { DaySummary } from "./SummaryCard";
import type { SearchMeal } from "./LogSheet";

export interface BalanceInfo {
  /** reductions applied TO the viewed day by earlier balances */
  incoming: Array<{ sourceDate: string; deltaKcal: number }>;
  /** the spread the viewed day created, if it was balanced */
  outgoing: { absorbed: number; days: number } | null;
  /** unadjusted daily target, the reference for caps */
  baseKcal: number;
  floorKcal: number;
  /** kcal already being reduced on days after today by OTHER source days */
  existingReductionByDate: Record<string, number>;
  /**
   * Last night's picture, always relative to the real today (not the viewed
   * day): the retroactive big-night flow logs and balances yesterday from
   * the today screen. Its spread starts AT today, so its capacity map keys
   * today and later and excludes yesterday-sourced rows (they get replaced).
   */
  yesterday: {
    date: string;
    eatenKcal: number;
    /** yesterday's adjusted target, the number its overage is measured against */
    targetKcal: number;
    outgoing: { absorbed: number; days: number } | null;
    existingReductionByDate: Record<string, number>;
  };
}

export interface TodayData {
  hasPlan: boolean;
  daySummary: string;
  meals: TodayMeal[];
  /** the viewed day's targets, including any weekly-balance reduction */
  targets: MacroTotals;
  logs: TodayLog[];
  summary: DaySummary | null;
  searchMeals: SearchMeal[];
  /** the day this data describes; equals localDateISO() when viewing today */
  viewedDate: string;
  isToday: boolean;
  /** consecutive logged days ending today (or yesterday while today is empty) */
  streak: number;
  /** trailing week, ascending, with eaten kcal and that day's adjusted target */
  week: Array<{ date: string; kcal: number; targetKcal: number }>;
  balance: BalanceInfo;
  /** onboarding goal at load time, recorded with takeout intent taps */
  goal: Goal | null;
  /** the takeout fake-door runtime flag (app_config.takeout_experiment) */
  takeoutEnabled: boolean;
}

/**
 * Client-side data loading for the Today screen. Replaces the former server
 * component so the same page runs in the Capacitor shell (no server there).
 * All queries are RLS-scoped table reads; unauthenticated or un-onboarded
 * visitors are routed away, mirroring what the middleware does on the web.
 */
export function useTodayData(viewDate?: string | null): {
  loading: boolean;
  data: TodayData | null;
  reload: () => Promise<void>;
} {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TodayData | null>(null);
  const reload = useCallback(async () => {
    const supabase = createClient();
    // getSession reads the locally persisted session; getUser is a network
    // round trip that can race session restoration on a cold shell launch
    // and bounce a signed-in user to the landing page.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      router.replace("/login");
      return;
    }

    const today = localDateISO();
    // A valid past date switches the page into read-only review; anything
    // else (missing, malformed, today, future) views today.
    const viewedDate =
      viewDate && /^\d{4}-\d{2}-\d{2}$/.test(viewDate) && viewDate < today ? viewDate : today;
    const isToday = viewedDate === today;

    // Stale-while-revalidate: paint the last snapshot for this user+day
    // immediately; the fresh fetch below replaces it silently.
    const snapKey = `today:${user.id}:${viewedDate}`;
    const snap = readSnapshot<TodayData>(snapKey);
    if (snap) {
      setData(snap);
      setLoading(false);
    }

    if (isToday) {
      // Signed-in and onboarded: this is the moment to ask for push (native only).
      void registerPush();

      // The app's day follows the device clock; keep the profile's timezone
      // and clock format fresh so the server (routes, meal reminders)
      // resolves the same day and writes time labels the way the device does.
      const tz = deviceTimeZone();
      if (tz) {
        const prefers24h = device24HourClock();
        const patch: { timezone: string; prefers_24h_time?: boolean } = { timezone: tz };
        // or-filter because a NULL column would never match a plain neq
        const guards = [`timezone.neq.${tz}`, "timezone.is.null"];
        if (prefers24h !== null) {
          patch.prefers_24h_time = prefers24h;
          guards.push(`prefers_24h_time.neq.${prefers24h}`, "prefers_24h_time.is.null");
        }
        void supabase
          .from("profiles")
          .update(patch)
          .eq("id", user.id)
          .or(guards.join(","))
          .then(() => undefined);
      }
    }

    const streakStart = trailingDates(today, 90)[0];
    const weekStart = trailingDates(today, 7)[0];
    // One round trip: the onboarding row rides in the same batch as the day
    // data instead of gating it (un-onboarded visitors just redirect after).
    const [
      { data: onboarding },
      { data: planRow },
      { data: logRows },
      { data: dailyLog },
      { data: allMeals },
      { data: historyRows },
      { data: adjustmentRows },
      { data: takeoutFlag },
    ] = await Promise.all([
        supabase
          .from("onboarding_answers")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single(),
        supabase
          .from("meal_plans")
          .select("llm_rationale, meals")
          .eq("user_id", user.id)
          .eq("date", viewedDate)
          .single(),
        supabase
          .from("meal_logs")
          .select("id, slot, plan_slot_index, name, kcal, protein_g, carbs_g, fat_g, source, verified")
          .eq("user_id", user.id)
          .eq("date", viewedDate)
          .order("logged_at", { ascending: true }),
        supabase
          .from("daily_logs")
          .select("reflection, tweak, finished_at, energy")
          .eq("user_id", user.id)
          .eq("date", viewedDate)
          .single(),
        supabase.from("meals").select("*"),
        // one scan feeds both the week strip (kcal per day) and the streak
        supabase
          .from("meal_logs")
          .select("date, kcal")
          .eq("user_id", user.id)
          .gte("date", streakStart)
          .lte("date", today),
        // weekly-balance deltas: the strip window plus everything after
        // today (spread preview capacity), plus the viewed day's own rows
        supabase
          .from("day_adjustments")
          .select("date, kcal_delta, source_date")
          .eq("user_id", user.id)
          .or(`date.gte.${weekStart},date.eq.${viewedDate},source_date.eq.${viewedDate}`),
        // takeout fake-door flag; maybeSingle so a missing row means off
        supabase
          .from("app_config")
          .select("value")
          .eq("key", "takeout_experiment")
          .maybeSingle(),
      ]);

    if (!onboarding) {
      router.replace("/onboarding");
      return;
    }

    const kcalByDate = new Map<string, number>();
    for (const row of historyRows ?? []) {
      kcalByDate.set(row.date, (kcalByDate.get(row.date) ?? 0) + Number(row.kcal));
    }
    const streak = loggingStreak(kcalByDate.keys(), today);

    const profile = profileFromRow(onboarding);
    const dayTargets = targets(profile, { displayUnits: "us" });
    const floorKcal = calorieFloor(profile);
    const baseTotals: MacroTotals = {
      kcal: dayTargets.kcal.value,
      proteinG: dayTargets.proteinG.value,
      carbsG: dayTargets.carbsG.value,
      fatG: dayTargets.fatG.value,
    };

    // Weekly balancing: per-day target deltas, applied everywhere a target
    // is shown so the day strip, hero, and goal band all agree.
    const deltaByDate = new Map<string, number>();
    for (const row of adjustmentRows ?? []) {
      deltaByDate.set(row.date, (deltaByDate.get(row.date) ?? 0) + Number(row.kcal_delta));
    }
    const adjustedKcalFor = (date: string) =>
      applyKcalDelta(
        baseTotals,
        (deltaByDate.get(date) ?? 0) + shiftDeltaFor(profile, date, baseTotals.kcal, floorKcal),
        floorKcal,
      ).kcal;

    const week = trailingDates(today, 7).map((date) => ({
      date,
      kcal: Math.round(kcalByDate.get(date) ?? 0),
      targetKcal: adjustedKcalFor(date),
    }));

    const incoming = (adjustmentRows ?? [])
      .filter((r) => r.date === viewedDate)
      .map((r) => ({ sourceDate: r.source_date, deltaKcal: Number(r.kcal_delta) }));
    const outgoingRows = (adjustmentRows ?? []).filter((r) => r.source_date === viewedDate);
    const outgoing =
      outgoingRows.length > 0
        ? {
            absorbed: outgoingRows.reduce((sum, r) => sum + Math.max(0, -Number(r.kcal_delta)), 0),
            days: outgoingRows.length,
          }
        : null;
    const existingReductionByDate: Record<string, number> = {};
    for (const r of adjustmentRows ?? []) {
      if (r.date > today && r.source_date !== today) {
        existingReductionByDate[r.date] =
          (existingReductionByDate[r.date] ?? 0) + Math.max(0, -Number(r.kcal_delta));
      }
    }

    const yesterdayDate = addDaysISO(today, -1);
    const yesterdayOutgoingRows = (adjustmentRows ?? []).filter(
      (r) => r.source_date === yesterdayDate,
    );
    const yesterdayExistingReduction: Record<string, number> = {};
    for (const r of adjustmentRows ?? []) {
      if (r.date >= today && r.source_date !== yesterdayDate) {
        yesterdayExistingReduction[r.date] =
          (yesterdayExistingReduction[r.date] ?? 0) + Math.max(0, -Number(r.kcal_delta));
      }
    }
    const yesterdayInfo: BalanceInfo["yesterday"] = {
      date: yesterdayDate,
      eatenKcal: Math.round(kcalByDate.get(yesterdayDate) ?? 0),
      targetKcal: adjustedKcalFor(yesterdayDate),
      outgoing:
        yesterdayOutgoingRows.length > 0
          ? {
              absorbed: yesterdayOutgoingRows.reduce(
                (sum, r) => sum + Math.max(0, -Number(r.kcal_delta)),
                0,
              ),
              days: yesterdayOutgoingRows.length,
            }
          : null,
      existingReductionByDate: yesterdayExistingReduction,
    };

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
            mealId: meal.id,
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
              carbsG: Number(meal.carbs_g),
              fatG: Number(meal.fat_g),
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

    const fresh: TodayData = {
      hasPlan: planRow !== null && mealsData.length > 0,
      daySummary,
      meals: mealsData,
      targets: applyKcalDelta(
        baseTotals,
        (deltaByDate.get(viewedDate) ?? 0) + shiftDeltaFor(profile, viewedDate, baseTotals.kcal, floorKcal),
        floorKcal,
      ),
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
      viewedDate,
      isToday,
      streak,
      week,
      balance: {
        incoming,
        outgoing,
        baseKcal: baseTotals.kcal,
        floorKcal,
        existingReductionByDate,
        yesterday: yesterdayInfo,
      },
      goal: onboarding.goal ?? null,
      takeoutEnabled: takeoutFlag?.value === true,
    };
    writeSnapshot(snapKey, fresh);
    setData(fresh);
    setLoading(false);
  }, [router, viewDate]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { loading, data, reload };
}
