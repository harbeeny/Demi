"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { planSpread, remainingWeekDates } from "@/lib/log/balance";
import { successHaptic } from "@/lib/haptics";
import { useSwipeToDismiss } from "./useSwipeToDismiss";
import type { BalanceInfo } from "./useTodayData";

/**
 * "Balance my week": spread a day's overage across the remaining days of
 * its week, gently (10%/day cap, safety floor, remainder forgiven). Also
 * hosts the rough-estimate path for nights nobody measured, which can
 * back-date the night to yesterday: logged the morning after, the calories
 * must land on the night they happened, or they consume today's budget
 * whole, which is the restrict trap this feature exists to prevent.
 * Balancing yesterday spreads from today onward, so today gives up at most
 * the same capped slice as any other day. Deliberately no guilt language
 * anywhere in this file; SAFETY.md screens for exactly that framing.
 */

const ROUGH_TIERS = [
  { label: "Drinks and snacks", kcal: 800 },
  { label: "Big dinner out", kcal: 1200 },
  { label: "Went well past it", kcal: 2000 },
];

/**
 * Lucide "scale" (ISC): the weekly-balance glyph. Shared by the sheet
 * header and both Today-screen triggers so the icon, not the copy, carries
 * the "this opens the balancer" association.
 */
export function ScaleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="M7 21h10" />
      <path d="M12 3v18" />
      <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
    </svg>
  );
}

/** Rough overages skew carbs and fat (alcohol counts as carbs); protein barely moves. */
export function roughEstimateMacros(kcal: number): {
  proteinG: number;
  carbsG: number;
  fatG: number;
} {
  return {
    proteinG: Math.round((kcal * 0.1) / 4),
    carbsG: Math.round((kcal * 0.55) / 4),
    fatG: Math.round((kcal * 0.35) / 9),
  };
}

function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    timeZone: "UTC",
  });
}

interface Applied {
  absorbed: number;
  forgiven: number;
  days: number;
  /**
   * Applied before noon means the user is logging last night from the
   * morning after, the hour the restrict impulse peaks. The reassurance
   * evening appliers get by push the next day (send-meal-reminders,
   * "balance-morning") renders inline instead; no push is scheduled for
   * balances applied before 17:00 local.
   */
  morning: boolean;
  /** which day's overage was spread; yesterday's spread includes today */
  source: SourceDay;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** the viewed day (always today; the affordance only renders there) */
  today: string;
  eatenKcal: number;
  /** today's adjusted target, the same number the hero shows */
  targetKcal: number;
  balance: BalanceInfo;
  /** logs a rough estimate entry to the chosen day; resolves true when it landed */
  onLogRough: (kcal: number, when: "today" | "yesterday") => Promise<boolean>;
  onMutated: () => Promise<void>;
}

type SourceDay = "today" | "yesterday";

export function BalanceSheet({
  open,
  onClose,
  today,
  eatenKcal,
  targetKcal,
  balance,
  onLogRough,
  onMutated,
}: Props) {
  const { sheetRef, scrollRef, mounted, sheetStyle, backdropStyle, handlers } =
    useSwipeToDismiss(open, onClose);

  const [applied, setApplied] = useState<Applied | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [customKcal, setCustomKcal] = useState("");
  const [error, setError] = useState("");
  // Before noon, an unlogged big night usually means LAST night; from noon
  // on it means earlier today. A default, not an inference: the user picks.
  const [whenChoice, setWhenChoice] = useState<SourceDay>("today");
  // Set after a rough log so the sheet can say what happened when the
  // entry fit inside its day's target and there's nothing to spread.
  const [roughLogged, setRoughLogged] = useState<SourceDay | null>(null);
  // Being over target and having an unlogged big night are independent
  // facts: a 74 kcal overage must not lock the rough path away. showRough
  // is the escape hatch out of the preview/outgoing states; focus pins the
  // sheet to the day a rough entry just landed on, overriding the
  // today-first priority so the night's own spread is what comes up next.
  const [showRough, setShowRough] = useState(false);
  const [focus, setFocus] = useState<SourceDay | null>(null);

  useEffect(() => {
    if (open) {
      setApplied(null);
      setBusy(null);
      setCustomKcal("");
      setError("");
      setWhenChoice(new Date().getHours() < 12 ? "yesterday" : "today");
      setRoughLogged(null);
      setShowRough(false);
      setFocus(null);
    }
  }, [open]);

  if (!mounted) return null;

  const y = balance.yesterday;
  const overage = Math.max(0, Math.round(eatenKcal - targetKcal));
  const yOverage = Math.max(0, Math.round(y.eatenKcal - y.targetKcal));

  // Which day this open serves. A just-logged rough entry pins its day;
  // otherwise today's live business (an overage or an existing spread)
  // wins; otherwise last night's; otherwise the rough path.
  const source: SourceDay =
    focus ??
    (overage > 0 || balance.outgoing ? "today" : yOverage > 0 || y.outgoing ? "yesterday" : "today");
  const sourceOverage = source === "yesterday" ? yOverage : overage;
  const sourceOutgoing = source === "yesterday" ? y.outgoing : balance.outgoing;

  // Cosmetic preview with the exact math the server re-runs on confirm.
  const preview =
    sourceOverage > 0
      ? planSpread({
          overageKcal: sourceOverage,
          sourceDate: source === "yesterday" ? y.date : today,
          targetKcal: balance.baseKcal,
          floorKcal: balance.floorKcal,
          existingReductionByDate:
            source === "yesterday" ? y.existingReductionByDate : balance.existingReductionByDate,
        })
      : null;

  const apply = async () => {
    setBusy("apply");
    setError("");
    try {
      const res = await apiFetch("/api/day/balance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        absorbed?: number;
        forgiven?: number;
        days?: Array<{ date: string }>;
      };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      successHaptic();
      setApplied({
        absorbed: data.absorbed ?? 0,
        forgiven: data.forgiven ?? 0,
        days: data.days?.length ?? 0,
        morning: new Date().getHours() < 12,
        source,
      });
      await onMutated();
    } catch {
      setError("Network hiccup. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("remove");
    setError("");
    try {
      const res = await apiFetch("/api/day/balance", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(source === "yesterday" ? { sourceDate: y.date } : {}),
      });
      if (!res.ok) {
        setError("Couldn't remove the balance.");
        return;
      }
      await onMutated();
      onClose();
    } catch {
      setError("Network hiccup. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const logRough = async (kcal: number) => {
    const rounded = Math.round(kcal);
    if (!Number.isFinite(rounded) || rounded < 50 || rounded > 3000) {
      setError("Enter between 50 and 3000 kcal.");
      return;
    }
    setBusy(`rough-${kcal}`);
    setError("");
    try {
      const ok = await onLogRough(rounded, whenChoice);
      if (ok) {
        successHaptic();
        setCustomKcal("");
        setRoughLogged(whenChoice);
        setShowRough(false);
        setFocus(whenChoice);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      style={backdropStyle}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        className="flex max-h-[80dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-[#f4f6f2] shadow-[0_-8px_40px_rgba(22,32,26,0.18)]"
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
        {...handlers}
      >
        <div data-drag-handle className="shrink-0 px-5 pt-3" style={{ touchAction: "none" }}>
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#cdd6c8]" aria-hidden="true" />
          <div className="mb-1 flex items-start justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold leading-snug text-[#2c3a2e]">
              <ScaleIcon className="h-[18px] w-[18px] shrink-0 text-[#829084]" />
              Balance my week
            </h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="press -mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#829084] hover:bg-[#e6ebe0] hover:text-[#2c3a2e]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-2">
          {error && <p className="mb-3 rounded-2xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}

          {applied ? (
            <>
              <p className="text-sm leading-6 text-[#3c4a3e]">
                Done. {applied.absorbed} kcal spread across {applied.days}{" "}
                {applied.days === 1 ? "day" : "days"}
                {applied.source === "yesterday"
                  ? ", starting with today; each gives up only a little."
                  : "; your upcoming targets moved down a little."}
              </p>
              {applied.forgiven > 0 && (
                <p className="mt-2 text-sm leading-6 text-[#5d6b5f]">
                  The remaining {applied.forgiven} kcal doesn&apos;t carry over. One day never
                  defines a week; the streak you keep does.
                </p>
              )}
              {applied.morning && (
                <p className="mt-2 text-sm leading-6 text-[#5d6b5f]">
                  Today stays a normal day: regular meals and plenty of water. There&apos;s
                  nothing to make up.
                </p>
              )}
              <button
                onClick={onClose}
                className="press mt-5 w-full rounded-2xl bg-[#2c3a2e] px-5 py-3 font-medium text-white"
              >
                Done
              </button>
            </>
          ) : sourceOutgoing && !showRough ? (
            <>
              <p className="text-sm leading-6 text-[#3c4a3e]">
                {source === "yesterday" ? "Last night" : "Today"} is already balanced:{" "}
                {sourceOutgoing.absorbed} kcal spread across {sourceOutgoing.days}{" "}
                {sourceOutgoing.days === 1 ? "day" : "days"}.
              </p>
              <p className="mt-2 text-sm leading-6 text-[#5d6b5f]">
                Logged more since? Recalculate replaces the current spread with a fresh one.
              </p>
              <button
                onClick={apply}
                disabled={busy !== null || sourceOverage <= 0}
                className="press mt-5 w-full rounded-2xl bg-[#2c3a2e] px-5 py-3 font-medium text-white disabled:opacity-60"
              >
                {busy === "apply" ? "Recalculating..." : "Recalculate"}
              </button>
              <button
                onClick={remove}
                disabled={busy !== null}
                className="press mt-2 w-full rounded-2xl border border-[#dce3d7] bg-white px-5 py-3 text-sm text-[#2c3a2e] disabled:opacity-60"
              >
                {busy === "remove" ? "Removing..." : "Remove the balance"}
              </button>
              <button
                onClick={() => setShowRough(true)}
                disabled={busy !== null}
                className="press mt-2 w-full rounded-2xl border border-[#dce3d7] bg-white px-5 py-3 text-sm text-[#2c3a2e] disabled:opacity-60"
              >
                Big night not logged yet? Add it first
              </button>
            </>
          ) : preview && !showRough ? (
            <>
              <p className="text-sm leading-6 text-[#3c4a3e]">
                {source === "yesterday" ? (
                  <>
                    Last night came to about{" "}
                    <span className="font-semibold">{sourceOverage} kcal</span> over. Spread it
                    across the week, starting today?
                  </>
                ) : (
                  <>
                    You&apos;re about <span className="font-semibold">{sourceOverage} kcal</span>{" "}
                    over today. Spread it across the rest of the week?
                  </>
                )}
              </p>
              {preview.days.length > 0 ? (
                <ul className="mt-4 space-y-1.5">
                  {preview.days.map((d) => (
                    <li
                      key={d.date}
                      className="flex items-center justify-between rounded-2xl bg-white px-4 py-2.5 text-sm shadow-sm"
                    >
                      <span className="text-[#2c3a2e]">
                        {d.date === today ? "Today" : dayLabel(d.date)}
                      </span>
                      <span className="tabular-nums text-[#5d6b5f]">{d.deltaKcal} kcal</span>
                    </li>
                  ))}
                </ul>
              ) : source === "yesterday" && remainingWeekDates(y.date).length === 0 ? (
                <p className="mt-3 text-sm leading-6 text-[#5d6b5f]">
                  Last night closed out its week, and closed weeks don&apos;t carry over. Today
                  starts clean.
                </p>
              ) : (
                <p className="mt-3 text-sm leading-6 text-[#5d6b5f]">
                  There&apos;s no room left in this week to absorb it, so nothing changes.
                </p>
              )}
              {preview.forgiven > 0 && preview.days.length > 0 && (
                <p className="mt-3 text-sm leading-6 text-[#5d6b5f]">
                  Each day gives up at most 10%, so {preview.forgiven} kcal won&apos;t carry over.
                </p>
              )}
              <p className="mt-3 text-xs leading-5 text-[#829084]">
                Protein targets stay put; the trim comes from carbs and fat.
              </p>
              {preview.days.length > 0 && (
                <button
                  onClick={apply}
                  disabled={busy !== null}
                  className="press mt-4 w-full rounded-2xl bg-[#2c3a2e] px-5 py-3 font-medium text-white disabled:opacity-60"
                >
                  {busy === "apply" ? "Spreading..." : "Spread it out"}
                </button>
              )}
              <button
                onClick={() => setShowRough(true)}
                disabled={busy !== null}
                className="press mt-2 w-full rounded-2xl border border-[#dce3d7] bg-white px-5 py-3 text-sm text-[#2c3a2e] disabled:opacity-60"
              >
                Big night not logged yet? Add it first
              </button>
            </>
          ) : (
            <>
              <p className="text-sm leading-6 text-[#3c4a3e]">
                {overage > 0 || yOverage > 0
                  ? "Add the night as a rough estimate first. Once it's logged, one spread covers all of it."
                  : "You're not over your target right now. If a big night isn't logged yet, say when it was, add a rough estimate, and we'll take it from there."}
              </p>
              {roughLogged && (
                <p className="mt-2 text-sm leading-6 text-[#5d6b5f]">
                  {roughLogged === "yesterday"
                    ? "Logged to last night. It stayed within that day's target, so there's nothing to spread and today isn't affected."
                    : "Logged. You're still within today's target, so there's nothing to spread."}
                </p>
              )}
              <div
                className="mt-4 flex rounded-2xl border border-[#dce3d7] bg-white p-1"
                role="group"
                aria-label="When was the big night?"
              >
                {(["yesterday", "today"] as const).map((w) => (
                  <button
                    key={w}
                    onClick={() => setWhenChoice(w)}
                    aria-pressed={whenChoice === w}
                    className={`press flex-1 rounded-xl px-3 py-2 text-sm ${
                      whenChoice === w
                        ? "bg-[#2c3a2e] font-medium text-white"
                        : "text-[#5d6b5f]"
                    }`}
                  >
                    {w === "yesterday" ? "Last night" : "Today"}
                  </button>
                ))}
              </div>
              <div className="mt-2 space-y-2">
                {ROUGH_TIERS.map((t) => (
                  <button
                    key={t.kcal}
                    onClick={() => logRough(t.kcal)}
                    disabled={busy !== null}
                    className="press flex w-full items-center justify-between rounded-2xl border border-[#dce3d7] bg-white px-4 py-3 text-sm text-[#2c3a2e] hover:border-[#8aa06f] disabled:opacity-60"
                  >
                    <span>{busy === `rough-${t.kcal}` ? "Logging..." : t.label}</span>
                    <span className="tabular-nums text-[#829084]">~{t.kcal} kcal</span>
                  </button>
                ))}
                <div className="flex gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={customKcal}
                    onChange={(e) => setCustomKcal(e.target.value)}
                    placeholder="Custom kcal"
                    aria-label="Custom calorie estimate"
                    className="min-w-0 flex-1 rounded-2xl border border-[#dce3d7] bg-white px-4 py-3 text-sm text-[#2c3a2e] outline-none focus:border-[#8aa06f]"
                  />
                  <button
                    onClick={() => logRough(Number(customKcal))}
                    disabled={busy !== null || customKcal.trim() === ""}
                    className="press rounded-2xl bg-[#2c3a2e] px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {busy === `rough-${Number(customKcal)}` ? "Logging..." : "Log it"}
                  </button>
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-[#829084]">
                It lands in the chosen day&apos;s log as a normal entry.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
