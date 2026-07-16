"use client";

import { useEffect, useRef, useState } from "react";

import { apiFetch, awaitPlanJob } from "@/lib/api";
import type { MacroTotals } from "@/lib/log/remaining";
import { remainingBudget, sumLogged } from "@/lib/log/remaining";
import { shouldOfferRebalance } from "@/lib/log/rebalance";
import type { MealLogSource } from "@/lib/supabase/types";
import { DayStrip } from "./DayStrip";
import { DaySummaryNote } from "./DaySummaryNote";
import { MacroSummary } from "./MacroSummary";
import { MealCard, timeLabel, type TodayMeal } from "./MealCard";
import { LogSheet, type SearchMeal } from "./LogSheet";
import { VerifiedBadge, type FdcLogFields } from "./FoodSearch";
import { goalHaptic, successHaptic, tapHaptic } from "@/lib/haptics";
import { kcalGoalMet } from "@/lib/log/goal";
import { BalanceSheet, roughEstimateMacros, ScaleIcon } from "./BalanceSheet";
import type { BalanceInfo } from "./useTodayData";
import { SLOT_LABELS, SLOT_ORDER, suggestSlot } from "@/lib/log/slots";
import type { MealSlot } from "@/lib/supabase/types";
import { SummaryCard, type DaySummary } from "./SummaryCard";
import { RecipeSheet, type RecipeData } from "@/components/kitchen/RecipeSheet";

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
  verified: boolean;
}

interface Props {
  hasPlan: boolean;
  daySummary: string;
  meals: TodayMeal[];
  targets: MacroTotals;
  logs: TodayLog[];
  summary: DaySummary | null;
  searchMeals: SearchMeal[];
  viewedDate: string;
  /** false when reviewing a past day: everything renders read-only */
  isToday: boolean;
  streak: number;
  week: Array<{ date: string; kcal: number; targetKcal: number }>;
  balance: BalanceInfo;
  /**
   * Switch the viewed day in place (null = today). State-driven on purpose:
   * a location change would reload the whole shell, flashing the UI and
   * racing auth restoration on every tap.
   */
  onSelectDate: (date: string | null) => void;
  /** re-runs the client data queries after a mutation (replaces router.refresh) */
  onMutated: () => Promise<void>;
}

export function TodayView({ hasPlan, daySummary, meals, targets, logs, summary, searchMeals, viewedDate, isToday, streak, week, balance, onSelectDate, onMutated }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  // Section the sheet was opened from; null when opened from the FAB, where
  // the slot picker asks instead.
  const [sheetSlot, setSheetSlot] = useState<MealSlot | null>(null);
  const openSheetFor = (slot: MealSlot | null) => {
    tapHaptic();
    setSheetSlot(slot);
    setSheetOpen(true);
  };
  const [recipe, setRecipe] = useState<{ data: RecipeData; slotIndex: number | null } | null>(null);
  const [balanceOpen, setBalanceOpen] = useState(false);
  // "plan" auto-builds a meal plan; "track" is the standalone macro tracker;
  // null means the user has never chosen (first no-plan visit shows a choice).
  const [dayMode, setDayMode] = useState<"plan" | "track" | null>(null);
  const [modeLoaded, setModeLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("demi:mode");
      if (stored === "plan" || stored === "track") setDayMode(stored);
    } catch {
      // storage unavailable: behave like a first visit
    }
    setModeLoaded(true);
  }, []);

  const chooseMode = (m: "plan" | "track") => {
    setDayMode(m);
    try {
      localStorage.setItem("demi:mode", m);
    } catch {
      // ignore
    }
    if (m === "plan" && !hasPlan) generate(false);
  };

  async function callApi(url: string, init: RequestInit, busyKey: string): Promise<boolean> {
    setBusy(busyKey);
    setError("");
    try {
      const res = await apiFetch(url, init);
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        supportive?: { text: string };
        queued?: boolean;
        jobId?: string;
      };
      if (data.supportive) {
        setNotice(data.supportive.text);
      }
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return false;
      }
      // Plan builds are queued now: hold the busy state through the poll so
      // "Building your day..." stays honest until the worker lands it.
      if (data.queued && data.jobId) {
        const job = await awaitPlanJob(data.jobId);
        if (!job.ok) {
          setError(job.error ?? "Something went wrong.");
          await onMutated();
          return false;
        }
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

  const logPlanned = async (slotIndex: number) => {
    const ok = await post("/api/log", { source: "planned", slotIndex }, `log-${slotIndex}`);
    // Fires as the reloaded totals land, so the buzz and the rings growing
    // read as one confirmation.
    if (ok) successHaptic();
    return ok;
  };
  const unlog = (logId: string) =>
    callApi(
      "/api/log",
      { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ logId }) },
      "unlog",
    );
  // Each returns whether the log landed; keepOpen leaves the sheet up for
  // rapid multi-adds (recents), which confirm inline instead of closing.
  const logDb = async (
    mealId: string,
    note: string,
    opts?: { keepOpen?: boolean; slot?: MealSlot },
  ) => {
    const ok = await post(
      "/api/log",
      { source: "db", mealId, slot: opts?.slot, note: note || undefined },
      "log-db",
    );
    if (ok && !opts?.keepOpen) setSheetOpen(false);
    return ok;
  };
  const logEstimate = async (
    fields: {
      name: string;
      kcal: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
      slot?: MealSlot;
      when?: "today" | "yesterday";
    },
    note: string,
    opts?: { keepOpen?: boolean },
  ) => {
    const ok = await post(
      "/api/log",
      { source: "estimate", ...fields, note: note || undefined },
      "log-estimate",
    );
    if (ok && !opts?.keepOpen) setSheetOpen(false);
    return ok;
  };
  const logFdc = async (fields: FdcLogFields, note: string, opts?: { keepOpen?: boolean }) => {
    const ok = await post("/api/log", { source: "fdc", ...fields, note: note || undefined }, "log-fdc");
    if (ok && !opts?.keepOpen) setSheetOpen(false);
    return ok;
  };
  const rebalance = () => post("/api/plan/rebalance", {}, "rebalance");
  const finishDay = (energy: number | null, note: string) =>
    post("/api/day/finish", { energy: energy ?? undefined, dayNote: note || undefined }, "finish");

  // No plan (new day, or onboarding's build failed): build it immediately
  // rather than asking the user to click a button. Ref guards double-fires
  // from re-renders; router.refresh() flips hasPlan when the plan lands.
  const autoBuildStarted = useRef(false);
  useEffect(() => {
    if (!isToday || !modeLoaded || dayMode !== "plan") return;
    if (!hasPlan && !autoBuildStarted.current) {
      autoBuildStarted.current = true;
      generate(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPlan, modeLoaded, dayMode, isToday]);

  const planned: MacroTotals = sumLogged(meals);
  const eaten: MacroTotals | null = logs.length > 0 ? sumLogged(logs) : null;

  // Celebrate crossing INTO the goal band from below (a log, not an undo,
  // and not on first load of an already-met day). The ref carries the date
  // so switching days never compares two different days' totals.
  const prevKcalRef = useRef<{ date: string; kcal: number } | null>(null);
  const eatenKcal = eaten?.kcal ?? 0;
  useEffect(() => {
    const prev = prevKcalRef.current;
    prevKcalRef.current = { date: viewedDate, kcal: eatenKcal };
    if (!isToday || !prev || prev.date !== viewedDate) return;
    if (
      eatenKcal > prev.kcal &&
      !kcalGoalMet(prev.kcal, targets.kcal) &&
      kcalGoalMet(eatenKcal, targets.kcal)
    ) {
      goalHaptic();
    }
  }, [eatenKcal, viewedDate, isToday, targets.kcal]);

  // Logged planned slots, matched by index so duplicate slot names stay distinct.
  const loggedBySlotIndex = new Map(
    logs.filter((l) => l.source === "planned" && l.planSlotIndex !== null).map((l) => [l.planSlotIndex, l.id]),
  );

  // Upcoming = unlogged planned meals whose time hasn't passed, in the
  // device's local clock (the same timezone the day boundary now follows).
  const nowHour = new Date().getHours() + new Date().getMinutes() / 60;
  const upcomingMeals = meals.filter(
    (m) => !loggedBySlotIndex.has(m.slotIndex) && m.timeHour >= nowHour,
  );
  const offerRebalance =
    eaten !== null &&
    shouldOfferRebalance(remainingBudget(targets, eaten), sumLogged(upcomingMeals), upcomingMeals.length);

  // A rough estimate for a night nobody measured: mostly carbs and fat,
  // logged as a normal editable estimate entry. Logged to today it takes
  // the clock-suggested slot; logged to last night it lands in snack (the
  // after-dinner hours the night actually happened in).
  const logRough = (kcal: number, when: "today" | "yesterday") =>
    logEstimate(
      {
        name: "Big night (rough estimate)",
        kcal,
        ...roughEstimateMacros(kcal),
        slot:
          when === "yesterday"
            ? "snack"
            : suggestSlot(new Date().getHours(), new Date().getMinutes()),
        when,
      },
      "",
      { keepOpen: true },
    );

  const eatenTotals = eaten ?? { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  const overKcal = Math.max(0, Math.round(eatenTotals.kcal - targets.kcal));
  const incomingDelta = balance.incoming.reduce((sum, a) => sum + a.deltaKcal, 0);

  // Hero + weekly-balance context, identical in all three day layouts.
  const budgetBlock = (
    <>
      <MacroSummary targets={targets} eaten={eatenTotals} />
      {incomingDelta < 0 && (
        <p className="mt-2 px-1 text-xs leading-5 text-[#829084]">
          Target trimmed {-incomingDelta} kcal today, balancing{" "}
          {balance.incoming.map((a) => dateShort(a.sourceDate)).join(" and ")}.
        </p>
      )}
      {balance.outgoing && (
        <button
          onClick={() => {
            tapHaptic();
            setBalanceOpen(true);
          }}
          disabled={!isToday}
          className="mt-2 px-1 text-left text-xs leading-5 text-[#829084] enabled:underline-offset-2 enabled:hover:underline"
        >
          This day&apos;s extra ({balance.outgoing.absorbed} kcal) is spread across{" "}
          {balance.outgoing.days} {balance.outgoing.days === 1 ? "day" : "days"}.
          {isToday ? " Adjust" : ""}
        </button>
      )}
    </>
  );

  // The balance trigger, split from the hero so plan mode can seat it
  // below "Why this plan" (user call); track and review keep it adjacent.
  const balanceCta = isToday && !balance.outgoing && (
    <>
      {overKcal > 0 ? (
          <button
            onClick={() => {
              tapHaptic();
              setBalanceOpen(true);
            }}
            disabled={busy !== null}
            className="press mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-[#8aa06f] bg-white px-4 py-3 text-sm text-[#2c3a2e] disabled:opacity-50"
          >
            <ScaleIcon className="h-4 w-4 shrink-0 text-[#829084]" />
            {overKcal} kcal over? Balance my week
          </button>
        ) : (
          // The same shape as every other tappable row on this screen; the
          // old bare-text version read as a caption, not a control.
          <button
            onClick={() => {
              tapHaptic();
              setBalanceOpen(true);
            }}
            disabled={busy !== null}
            className="press mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-[#dce3d7] bg-white px-4 py-3 text-sm text-[#2c3a2e] hover:border-[#8aa06f] disabled:opacity-50"
          >
            <ScaleIcon className="h-4 w-4 shrink-0 text-[#829084]" />
            Had a big night? Balance my week
          </button>
      )}
    </>
  );

  return (
    <main className="mx-auto w-full min-h-dvh max-w-md bg-[#f4f6f2] px-5 pb-36 pt-8">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#d3e29f] font-semibold text-[#2c3a2e]">D</span>
          <h1 className="text-lg font-semibold leading-tight text-[#2c3a2e]">
            {isToday ? "Today" : dateHeading(viewedDate)}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="flex items-center gap-1 rounded-full border border-[#dce3d7] bg-white px-3 py-1.5 text-sm font-medium text-[#2c3a2e]"
            title={`${streak}-day logging streak`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#d97f3e" aria-hidden="true">
              <path d="M12 2c1 4-3 5.5-3 9a3 3 0 0 0 6 .2c1.6 1.3 2.5 3 2.5 4.8A5.5 5.5 0 0 1 12 21.5 5.5 5.5 0 0 1 6.5 16C6.5 10.5 12 8.5 12 2z" />
            </svg>
            <span aria-label={`${streak} day logging streak`}>{streak}</span>
          </span>
          {isToday && hasPlan && (
            <button
              onClick={() => generate(true)}
              disabled={busy !== null}
              className="press rounded-full border border-[#dce3d7] bg-white px-4 py-2 text-sm text-[#2c3a2e] hover:border-[#8aa06f] disabled:opacity-50"
            >
              {busy === "generate" ? "Working..." : "Regenerate"}
            </button>
          )}
          {/* Track mode's way back to suggestions, in the same header slot
              plan users know; the bottom text link alone was undiscoverable. */}
          {isToday && !hasPlan && dayMode === "track" && (
            <button
              onClick={() => chooseMode("plan")}
              disabled={busy !== null}
              className="press rounded-full border border-[#dce3d7] bg-white px-4 py-2 text-sm text-[#2c3a2e] hover:border-[#8aa06f] disabled:opacity-50"
            >
              {busy === "generate" ? "Building..." : "Get meal ideas"}
            </button>
          )}
        </div>
      </header>

      <DayStrip
        week={week}
        selectedDate={viewedDate}
        onSelect={(d) => {
          const today = week[week.length - 1]?.date;
          onSelectDate(d === today ? null : d);
        }}
      />

      {!isToday && (
        <button
          onClick={() => onSelectDate(null)}
          className="mb-4 text-xs text-[#7a9a4e] underline-offset-2 hover:underline"
        >
          Back to today
        </button>
      )}

      {error && <p className="mb-4 rounded-2xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && (
        <p className="mb-4 rounded-2xl bg-[#e9efdd] p-4 text-sm leading-6 text-[#3c4a3e]">{notice}</p>
      )}

      {/* Keyed by day so switching replays a short enter transition: the
          content change reads as turning a page, not the screen shrinking. */}
      <div key={viewedDate} className="step-in">
      {!isToday ? (
        <>
          {budgetBlock}
          {SLOT_ORDER.map((s) => (
            <MealSection
              key={s}
              slot={s}
              plannedMeals={[]}
              logs={logs.filter((l) => l.slot === s)}
              busy={busy}
              readOnly
              onConfirm={logPlanned}
              onUndo={unlog}
              onSwap={swap}
              onRecipe={(r, slotIndex) => setRecipe({ data: r, slotIndex })}
              onAdd={openSheetFor}
            />
          ))}
          <OtherSection logs={logs} busy={busy} readOnly onUndo={unlog} />
          {summary && (
            <section className="mt-6 rounded-3xl bg-white p-4 shadow-sm">
              <h2 className="text-xs font-medium uppercase tracking-wide text-[#829084]">
                Day reflection
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#3c4a3e]">{summary.reflection}</p>
              <p className="mt-2 text-sm leading-6 text-[#3c4a3e]">{summary.tweak}</p>
            </section>
          )}
        </>
      ) : null}

      {isToday && !hasPlan && dayMode === "track" ? (
        <>
          {budgetBlock}
          {balanceCta}

          {SLOT_ORDER.map((s) => (
            <MealSection
              key={s}
              slot={s}
              plannedMeals={[]}
              logs={logs.filter((l) => l.slot === s)}
              busy={busy}
              onConfirm={logPlanned}
              onUndo={unlog}
              onSwap={swap}
              onRecipe={(r, slotIndex) => setRecipe({ data: r, slotIndex })}
              onAdd={openSheetFor}
            />
          ))}
          <OtherSection logs={logs} busy={busy} onUndo={unlog} />

          <SummaryCard
            logsCount={logs.length}
            summary={summary}
            planned={null}
            actual={eaten ?? { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }}
            busy={busy}
            onFinish={finishDay}
          />

          <button
            onClick={() => chooseMode("plan")}
            disabled={busy !== null}
            className="mt-6 w-full text-center text-xs text-[#829084] underline-offset-2 hover:underline disabled:opacity-50"
          >
            Switch to a meal plan
          </button>
        </>
      ) : isToday && !hasPlan && dayMode === null && modeLoaded && !busy ? (
        <div className="mt-16 space-y-3 text-center">
          <p className="text-[#2c3a2e]">How do you want to run today?</p>
          <button
            onClick={() => chooseMode("plan")}
            className="press w-full rounded-2xl bg-[#2c3a2e] px-6 py-3 font-medium text-white"
          >
            Build today&apos;s plan
          </button>
          <button
            onClick={() => chooseMode("track")}
            className="press w-full rounded-2xl border border-[#dce3d7] bg-white px-6 py-3 font-medium text-[#2c3a2e] hover:border-[#8aa06f]"
          >
            Just track what I eat
          </button>
        </div>
      ) : isToday && !hasPlan ? (
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
      ) : isToday && hasPlan ? (
        <>
          {budgetBlock}

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

          {daySummary && <DaySummaryNote text={daySummary} />}
          {balanceCta}

          {SLOT_ORDER.map((s) => (
            <MealSection
              key={s}
              slot={s}
              plannedMeals={meals.filter(
                (m) => m.slot === s && !loggedBySlotIndex.has(m.slotIndex),
              )}
              logs={logs.filter((l) => l.slot === s)}
              busy={busy}
              onConfirm={logPlanned}
              onUndo={unlog}
              onSwap={swap}
              onRecipe={(r, slotIndex) => setRecipe({ data: r, slotIndex })}
              onAdd={openSheetFor}
            />
          ))}
          <OtherSection logs={logs} busy={busy} onUndo={unlog} />

          <SummaryCard
            logsCount={logs.length}
            summary={summary}
            planned={hasPlan ? planned : null}
            actual={eaten ?? { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }}
            busy={busy}
            onFinish={finishDay}
          />
        </>
      ) : null}
      </div>

      <p className="mt-10 text-center text-xs leading-5 text-[#829084]">
        Demi offers general wellness guidance, not medical advice.
      </p>

      {/* Floating log action, bottom-right above the tab bar. Rendered in the
          same states that previously showed an inline log button; the sheet's
          z-40 backdrop covers it while open. */}
      {isToday && (hasPlan || dayMode === "track") && (
        <button
          onClick={() => openSheetFor(null)}
          disabled={busy !== null}
          aria-label="Log a food"
          className="press fixed bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] right-[max(1.25rem,calc(50vw-14rem+1.25rem))] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#2c3a2e] text-white shadow-[0_8px_24px_rgba(22,32,26,0.35)] hover:bg-[#243027] disabled:opacity-60"
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      )}

      <RecipeSheet
        recipe={recipe?.data ?? null}
        action={
          recipe && isToday && recipe.slotIndex !== null && !loggedBySlotIndex.has(recipe.slotIndex)
            ? {
                label: "I ate this",
                busyLabel: "Logging...",
                run: async () => {
                  const idx = recipe.slotIndex as number;
                  if (await logPlanned(idx)) setRecipe(null);
                },
              }
            : null
        }
        onClose={() => setRecipe(null)}
      />

      <LogSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        searchMeals={searchMeals}
        busy={busy}
        defaultMode="fdc"
        forcedSlot={sheetSlot}
        onLogDb={logDb}
        onLogEstimate={logEstimate}
        onLogFdc={logFdc}
      />

      <BalanceSheet
        open={balanceOpen}
        onClose={() => setBalanceOpen(false)}
        today={viewedDate}
        eatenKcal={eatenTotals.kcal}
        targetKcal={targets.kcal}
        balance={balance}
        onLogRough={logRough}
        onMutated={onMutated}
      />
    </main>
  );
}


/** "Monday, July 14" style heading for a reviewed day. */
function dateHeading(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "Fri, Jul 17" style short date for the balance notes. */
function dateShort(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** One meal's home: the suggested plan meal, the logged foods, and its Add. */
function MealSection({
  slot,
  plannedMeals,
  logs,
  busy,
  readOnly = false,
  onConfirm,
  onUndo,
  onSwap,
  onRecipe,
  onAdd,
}: {
  slot: MealSlot;
  plannedMeals: TodayMeal[];
  logs: TodayLog[];
  busy: string | null;
  readOnly?: boolean;
  onConfirm: (slotIndex: number) => void;
  onUndo: (id: string) => void;
  onSwap: (slotIndex: number) => void;
  onRecipe: (recipe: NonNullable<TodayMeal["recipe"]>, slotIndex: number) => void;
  onAdd: (slot: MealSlot) => void;
}) {
  const sectionKcal = logs.reduce((sum, l) => sum + l.kcal, 0);
  const time = plannedMeals[0]?.timeHour;

  return (
    <section className="mt-5">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wide text-[#829084]">
          {SLOT_LABELS[slot]}
          {time !== undefined ? ` · ${timeLabel(time)}` : ""}
        </h2>
        {sectionKcal > 0 && (
          <span className="text-xs text-[#829084]">{Math.round(sectionKcal)} kcal</span>
        )}
      </div>
      <div className="space-y-2">
        {plannedMeals.map((meal) => (
          <MealCard
            key={meal.slotIndex}
            meal={meal}
            loggedId={null}
            compact
            busy={busy}
            onConfirm={onConfirm}
            onUndo={onUndo}
            onSwap={onSwap}
            onRecipe={onRecipe}
          />
        ))}
        {logs.map((l) => (
          <LogRow key={l.id} log={l} busy={busy} readOnly={readOnly} onUndo={onUndo} />
        ))}
        {/* A reviewed day keeps a quiet body in empty sections; bare headings
            collapse the page and read as the screen shrinking. */}
        {readOnly && plannedMeals.length === 0 && logs.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[#e0e6db] px-4 py-2.5 text-sm text-[#a9b4a6]">
            Nothing logged
          </p>
        )}
        {!readOnly && (
          <button
            onClick={() => onAdd(slot)}
            disabled={busy !== null}
            className="press w-full rounded-2xl border border-dashed border-[#c9d3c3] bg-transparent px-4 py-2.5 text-left text-sm text-[#829084] hover:border-[#8aa06f] hover:text-[#2c3a2e] disabled:opacity-50"
          >
            + Add
          </button>
        )}
      </div>
    </section>
  );
}

/** Logs from before meal sections existed; read-only home, no Add. */
function OtherSection({
  logs,
  busy,
  readOnly = false,
  onUndo,
}: {
  logs: TodayLog[];
  busy: string | null;
  readOnly?: boolean;
  onUndo: (id: string) => void;
}) {
  const items = logs.filter((l) => !l.slot || !SLOT_ORDER.includes(l.slot as MealSlot));
  if (items.length === 0) return null;
  return (
    <section className="mt-5">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-[#829084]">Other</h2>
      <div className="space-y-2">
        {items.map((l) => (
          <LogRow key={l.id} log={l} busy={busy} readOnly={readOnly} onUndo={onUndo} />
        ))}
      </div>
    </section>
  );
}

function LogRow({
  log,
  busy,
  readOnly = false,
  onUndo,
}: {
  log: TodayLog;
  busy: string | null;
  readOnly?: boolean;
  onUndo: (id: string) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-sm">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-medium text-[#2c3a2e]">
          <span className="truncate">{log.name}</span>
          {log.verified && <VerifiedBadge />}
          {log.source === "estimate" && (
            <span className="shrink-0 rounded-full bg-[#fdf3d7] px-2 py-0.5 text-[10px] text-[#7a6420]">estimate</span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-[#5d6b5f]">
          {Math.round(log.kcal)} kcal · P {Math.round(log.proteinG)}g
        </p>
      </div>
      {!readOnly && (
        <button
          onClick={() => onUndo(log.id)}
          disabled={busy !== null}
          className="text-xs text-[#829084] underline-offset-2 hover:underline disabled:opacity-50"
        >
          Undo
        </button>
      )}
    </div>
  );
}
