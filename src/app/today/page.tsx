"use client";

import { useCallback, useState } from "react";

import { TodayView } from "@/components/today/TodayView";
import { useTodayData } from "@/components/today/useTodayData";
import { TabBar } from "@/components/TabBar";

/**
 * Client-rendered so the same page works in the Capacitor shell, where no
 * server exists. Data loads through the browser Supabase client (RLS-scoped);
 * targets are recomputed locally from the onboarding row, and the API routes
 * recompute them independently server-side before any write (SAFETY.md).
 */
export default function TodayPage() {
  // ?date=YYYY-MM-DD reviews a past day read-only. Parsed from the location
  // (not useSearchParams) so the static export needs no Suspense boundary;
  // the initializer runs client-side and the loading gate renders either way.
  const [viewDate, setViewDate] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("date"),
  );
  const { loading, data, reload } = useTodayData(viewDate);

  // Day switching stays in React state; a location change would reload the
  // whole shell (white flash) and race auth restoration on every tap. The
  // URL is kept in sync for shareability without triggering navigation.
  const selectDate = useCallback((date: string | null) => {
    setViewDate(date);
    // Start each day at the top: switching mid-scroll into shorter content
    // otherwise reads as the page collapsing.
    window.scrollTo({ top: 0, behavior: "auto" });
    try {
      window.history.replaceState(null, "", date ? `/today?date=${date}` : "/today");
    } catch {
      // history unavailable: state alone still drives the view
    }
  }, []);

  if (loading || !data) {
    return (
      <main className="mx-auto w-full flex min-h-dvh max-w-md items-center justify-center bg-[#f4f6f2]">
        <p className="animate-pulse text-[#2c3a2e]">Loading your day...</p>
        <TabBar />
      </main>
    );
  }

  return (
    <>
      <TodayView
        hasPlan={data.hasPlan}
        daySummary={data.daySummary}
        meals={data.meals}
        targets={data.targets}
        logs={data.logs}
        summary={data.summary}
        searchMeals={data.searchMeals}
        viewedDate={data.viewedDate}
        isToday={data.isToday}
        streak={data.streak}
        week={data.week}
        onSelectDate={selectDate}
        onMutated={reload}
      />
      <TabBar />
    </>
  );
}
