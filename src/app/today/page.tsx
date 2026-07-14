"use client";

import { TodayView } from "@/components/today/TodayView";
import { useTodayData } from "@/components/today/useTodayData";

/**
 * Client-rendered so the same page works in the Capacitor shell, where no
 * server exists. Data loads through the browser Supabase client (RLS-scoped);
 * targets are recomputed locally from the onboarding row, and the API routes
 * recompute them independently server-side before any write (SAFETY.md).
 */
export default function TodayPage() {
  const { loading, data, reload } = useTodayData();

  if (loading || !data) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center bg-[#f4f6f2]">
        <p className="animate-pulse text-[#2c3a2e]">Loading your day...</p>
      </main>
    );
  }

  return (
    <TodayView
      hasPlan={data.hasPlan}
      daySummary={data.daySummary}
      meals={data.meals}
      targets={data.targets}
      logs={data.logs}
      summary={data.summary}
      searchMeals={data.searchMeals}
      onMutated={reload}
    />
  );
}
