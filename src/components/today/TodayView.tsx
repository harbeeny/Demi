"use client";

import { useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import type { MacroTotals } from "@/lib/log/remaining";
import { remainingBudget, sumLogged } from "@/lib/log/remaining";
import { shouldOfferRebalance } from "@/lib/log/rebalance";
import type { MealLogSource } from "@/lib/supabase/types";
import { MacroRings } from "./MacroRings";
import { MealCard, type TodayMeal } from "./MealCard";
import { LogSheet, type SearchMeal } from "./LogSheet";
import { SummaryCard, type DaySummary } from "./SummaryCard";

export type { TodayMeal };

export interface TodayLog {
  id: string;
  slot: string | null;
  planSlotIndex: number | null;
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  source: MealLogSource;
}

interface Props {
  hasPlan: boolean;
  daySummary: string;
  meals: TodayMeal[];
  targets: MacroTotals;
  logs: TodayLog[];
  summary: DaySummary | null;
  searchMeals: SearchMeal[];
  /** re-runs the client data queries after a mutation (replaces router.refresh) */
  onMutated: () => Promise<void>;
}

export function TodayView({ hasPlan, daySummary, meals, targets, logs, summary, searchMeals, onMutated }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

  async function callApi(url: string, init: RequestInit, busyKey: string): Promise<boolean> {
    setBusy(busyKey);
    setError("");
    try {
      const res = await apiFetch(url, init);
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        supportive?: { text: string };
      };
      if (data.supportive) {
        setNotice(data.supportive.text);
      }
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return false;
      }
      await onMutated();
      return true;
    } catch {
      setError("Network hiccup. Try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  const post = (url: string, body: unknown, busyKey: string) =>
    callApi(
      url,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
      busyKey,
    );

  const generate = (regenerate: boolean) => post("/api/plan", { regenerate }, "generate");
  const swap = (slotIndex: number) =>
    callApi(
      "/api/plan",
      { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ slotIndex }) },
      `swap-${slotIndex}`,
    );

  const logPlanned = (slotIndex: number) =>
    post("/api/log", { source: "planned", slotIndex }, `log-${slotIndex}`);
  const unlog = (logId: string) =>
    callApi(
      "/api/log",
      { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ logId }) },
      "unlog",
    );
  const logDb = async (mealId: string, note: string) => {
    if (await post("/api/log", { source: "db", mealId, note: note || undefined }, "log-db")) {
      setSheetOpen(false);
    }
  };
  const logEstimate = async (
    fields: { name: string; kcal: number; proteinG: number; carbsG: number; fatG: number },
    note: string,
  ) => {
    if (await post("/api/log", { source: "estimate", ...fields, note: note || undefined }, "log-estimate")) {
      setSheetOpen(false);
    }
  };
  const rebalance = () => post("/api/plan/rebalance", {}, "rebalance");
  const finishDay = (energy: number | null, note: string) =>
    post("/api/day/finish", { energy: energy ?? undefined, dayNote: note || undefined }, "finish");

  // No plan (new day, or onboarding's build failed): build it immediately
  // rather than asking the user to click a button. Ref guards double-fires
  // from re-renders; router.refresh() flips hasPlan when the plan lands.
  const autoBuildStarted = useRef(false);
  useEffect(() => {
    if (!hasPlan && !autoBuildStarted.current) {
      autoBuildStarted.current = true;
      generate(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPlan]);

  const planned: MacroTotals = sumLogged(meals);
  const eaten: MacroTotals | null = logs.length > 0 ? sumLogged(logs) : null;

  // Logged planned slots, matched by index so duplicate slot names stay distinct.
  const loggedBySlotIndex = new Map(
    logs.filter((l) => l.source === "planned" && l.planSlotIndex !== null).map((l) => [l.planSlotIndex, l.id]),
  );

  // Upcoming = unlogged planned meals whose time hasn't passed. Hours compare
  // in UTC to match the server's todayISO convention.
  const nowHour = new Date().getUTCHours() + new Date().getUTCMinutes() / 60;
  const upcomingMeals = meals.filter(
    (m) => !loggedBySlotIndex.has(m.slotIndex) && m.timeHour >= nowHour,
  );
  const offerRebalance =
    eaten !== null &&
    shouldOfferRebalance(remainingBudget(targets, eaten), sumLogged(upcomingMeals), upcomingMeals.length);

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-[#f4f6f2] px-5 pb-24 pt-8">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#d3e29f] font-semibold text-[#2c3a2e]">D</span>
          <div>
            <h1 className="text-lg font-semibold leading-tight text-[#2c3a2e]">Today</h1>
            <p className="text-xs text-[#829084]">
              {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
        </div>
        {hasPlan && (
          <button
            onClick={() => generate(true)}
            disabled={busy !== null}
            className="press rounded-full border border-[#dce3d7] bg-white px-4 py-2 text-sm text-[#2c3a2e] hover:border-[#8aa06f] disabled:opacity-50"
          >
            {busy === "generate" ? "Working..." : "Regenerate"}
          </button>
        )}
      </header>

      {error && <p className="mb-4 rounded-2xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && (
        <p className="mb-4 rounded-2xl bg-[#e9efdd] p-4 text-sm leading-6 text-[#3c4a3e]">{notice}</p>
      )}

      {!hasPlan ? (
        <div className="mt-16 text-center">
          {error ? (
            <button
              onClick={() => generate(false)}
              disabled={busy !== null}
              className="press rounded-2xl bg-[#2c3a2e] px-6 py-3 font-medium text-white disabled:opacity-60"
            >
              Try again
            </button>
          ) : (
            <p className="animate-pulse text-[#2c3a2e]">Building your day...</p>
          )}
        </div>
      ) : (
        <>
          <MacroRings planned={planned} eaten={eaten} targets={targets} />

          {offerRebalance && (
            <button
              onClick={rebalance}
              disabled={busy !== null}
              className="press mb-6 w-full rounded-2xl border border-[#8aa06f] bg-white px-4 py-3 text-sm text-[#2c3a2e] disabled:opacity-50"
            >
              {busy === "rebalance"
                ? "Rebalancing..."
                : "Your day shifted. Rebalance the remaining meals?"}
            </button>
          )}

          {daySummary && (
            <p className="mb-6 rounded-3xl bg-[#e9efdd] p-4 text-sm leading-6 text-[#3c4a3e]">{daySummary}</p>
          )}

          <section className="space-y-4">
            {meals.map((meal) => (
              <MealCard
                key={meal.slotIndex}
                meal={meal}
                loggedId={loggedBySlotIndex.get(meal.slotIndex) ?? null}
                busy={busy}
                onConfirm={logPlanned}
                onUndo={unlog}
                onSwap={swap}
              />
            ))}
          </section>

          {logs.some((l) => l.source !== "planned") && (
            <section className="mt-6 space-y-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-[#829084]">Also logged</h2>
              {logs
                .filter((l) => l.source !== "planned")
                .map((l) => (
                  <div key={l.id} className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-sm">
                    <div>
                      <p className="text-sm font-medium text-[#2c3a2e]">
                        {l.name}
                        {l.source === "estimate" && (
                          <span className="ml-2 rounded-full bg-[#fdf3d7] px-2 py-0.5 text-[10px] text-[#7a6420]">estimate</span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-[#5d6b5f]">
                        {Math.round(l.kcal)} kcal · P {Math.round(l.proteinG)}g
                      </p>
                    </div>
                    <button
                      onClick={() => unlog(l.id)}
                      disabled={busy !== null}
                      className="text-xs text-[#829084] underline-offset-2 hover:underline disabled:opacity-50"
                    >
                      Undo
                    </button>
                  </div>
                ))}
            </section>
          )}

          <button
            onClick={() => setSheetOpen(true)}
            disabled={busy !== null}
            className="press mt-6 w-full rounded-2xl border border-dashed border-[#8aa06f] bg-transparent px-4 py-3 text-sm text-[#2c3a2e] disabled:opacity-50"
          >
            + Log something else
          </button>

          <SummaryCard
            logsCount={logs.length}
            summary={summary}
            planned={hasPlan ? planned : null}
            actual={eaten ?? { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }}
            busy={busy}
            onFinish={finishDay}
          />
        </>
      )}

      <p className="mt-10 text-center text-xs leading-5 text-[#829084]">
        Demi offers general wellness guidance, not medical advice.
      </p>

      <LogSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        searchMeals={searchMeals}
        busy={busy}
        onLogDb={logDb}
        onLogEstimate={logEstimate}
      />
    </main>
  );
}
