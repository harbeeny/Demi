"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { planSpread } from "@/lib/log/balance";
import { successHaptic } from "@/lib/haptics";
import { useSwipeToDismiss } from "./useSwipeToDismiss";
import type { BalanceInfo } from "./useTodayData";

/**
 * "Balance my week": spread today's overage across the remaining days of
 * the week, gently (10%/day cap, safety floor, remainder forgiven). Also
 * hosts the rough-estimate path for nights nobody measured. Deliberately
 * no guilt language anywhere in this file; SAFETY.md screens for exactly
 * that framing.
 */

const ROUGH_TIERS = [
  { label: "Drinks and snacks", kcal: 800 },
  { label: "Big dinner out", kcal: 1200 },
  { label: "Went well past it", kcal: 2000 },
];

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
  /** logs a rough estimate entry; resolves true when it landed */
  onLogRough: (kcal: number) => Promise<boolean>;
  onMutated: () => Promise<void>;
}

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

  useEffect(() => {
    if (open) {
      setApplied(null);
      setBusy(null);
      setCustomKcal("");
      setError("");
    }
  }, [open]);

  if (!mounted) return null;

  const overage = Math.max(0, Math.round(eatenKcal - targetKcal));
  // Cosmetic preview with the exact math the server re-runs on confirm.
  const preview =
    overage > 0
      ? planSpread({
          overageKcal: overage,
          sourceDate: today,
          targetKcal: balance.baseKcal,
          floorKcal: balance.floorKcal,
          existingReductionByDate: balance.existingReductionByDate,
        })
      : null;

  const apply = async () => {
    setBusy("apply");
    setError("");
    try {
      const res = await apiFetch("/api/day/balance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
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
        body: "{}",
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
      const ok = await onLogRough(rounded);
      if (ok) {
        successHaptic();
        setCustomKcal("");
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
            <h2 className="text-lg font-semibold leading-snug text-[#2c3a2e]">Balance my week</h2>
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
                {applied.days === 1 ? "day" : "days"}; your upcoming targets moved down a little.
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
          ) : balance.outgoing ? (
            <>
              <p className="text-sm leading-6 text-[#3c4a3e]">
                Today is already balanced: {balance.outgoing.absorbed} kcal spread across{" "}
                {balance.outgoing.days} {balance.outgoing.days === 1 ? "day" : "days"}.
              </p>
              <p className="mt-2 text-sm leading-6 text-[#5d6b5f]">
                Logged more since? Recalculate replaces the current spread with a fresh one.
              </p>
              <button
                onClick={apply}
                disabled={busy !== null || overage <= 0}
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
            </>
          ) : preview ? (
            <>
              <p className="text-sm leading-6 text-[#3c4a3e]">
                You&apos;re about <span className="font-semibold">{overage} kcal</span> over today.
                Spread it across the rest of the week?
              </p>
              {preview.days.length > 0 ? (
                <ul className="mt-4 space-y-1.5">
                  {preview.days.map((d) => (
                    <li
                      key={d.date}
                      className="flex items-center justify-between rounded-2xl bg-white px-4 py-2.5 text-sm shadow-sm"
                    >
                      <span className="text-[#2c3a2e]">{dayLabel(d.date)}</span>
                      <span className="tabular-nums text-[#5d6b5f]">{d.deltaKcal} kcal</span>
                    </li>
                  ))}
                </ul>
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
            </>
          ) : (
            <>
              <p className="text-sm leading-6 text-[#3c4a3e]">
                You&apos;re not over your target right now. If a big night isn&apos;t logged yet,
                add a rough estimate and we&apos;ll take it from there.
              </p>
              <div className="mt-4 space-y-2">
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
                It lands in your log as an editable entry; undo it anytime.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
