"use client";

import { useState } from "react";

export interface AdjustState {
  proposal: {
    id: string;
    createdAt: string;
    correctionDelta: number;
    newCorrection: number;
    previewKcal: number;
    rationale: string;
    windowStats: {
      avgLoggedKcal?: number;
      observedRateKgPerWeek?: number;
      loggedDayCount?: number;
      weighInCount?: number;
      spanDays?: number;
      confidence?: string;
    };
  } | null;
  insufficientData: string[];
  cooldownUntil: string | null;
  progress: {
    weighInCount: number;
    weighInsNeeded: number;
    spanDays: number;
    spanDaysNeeded: number;
    loggedDayCount: number;
    loggedDaysNeeded: number;
  };
}

interface Props {
  state: AdjustState;
  busy: boolean;
  onResolve: (id: string, action: "accept" | "dismiss") => void;
  accepted: { newKcal: number; explanation: string } | null;
}

/**
 * The adaptive-target card. Four states from the API: collecting data,
 * on track, open proposal, accepted. SAFETY: never streak-framed, never
 * praise for eating less; safety-gated users get no card at all (the page
 * hides it when insufficientData includes safety_maintenance_active).
 */
export function AdaptCard({ state, busy, onResolve, accepted }: Props) {
  const [showMath, setShowMath] = useState(false);

  if (accepted) {
    return (
      <Card title="Adaptive target">
        <p className="text-sm leading-6 text-(--ink)">
          Done. Your daily target is now <span className="font-semibold">{accepted.newKcal} kcal</span>.
        </p>
        <p className="mt-2 text-sm leading-6 text-(--ink-2)">{accepted.explanation}</p>
        <p className="mt-2 text-xs text-(--muted)">
          You can revisit this anytime; your goal and pace are unchanged.
        </p>
      </Card>
    );
  }

  const { proposal, insufficientData, cooldownUntil, progress } = state;

  if (proposal) {
    const direction = proposal.correctionDelta < 0 ? "lower" : "raise";
    const stats = proposal.windowStats;
    return (
      <Card title="Adaptive target">
        <p className="text-sm font-medium leading-6 text-(--ink)">
          Suggestion: {direction} your daily target by {Math.abs(proposal.correctionDelta)} kcal to{" "}
          {proposal.previewKcal} kcal.
        </p>
        <p className="mt-2 text-sm leading-6 text-(--ink-2)">{proposal.rationale}</p>
        {stats.confidence === "moderate" && (
          <p className="mt-2 text-xs text-(--muted)">
            Based on a smaller sample, so treat this as a first pass.
          </p>
        )}
        <button
          onClick={() => setShowMath((s) => !s)}
          className="mt-2 text-xs text-(--accent-strong) underline-offset-2 hover:underline"
        >
          {showMath ? "Hide the details" : "How we worked this out"}
        </button>
        {showMath && (
          <ul className="mt-2 space-y-1 text-xs text-(--ink-2)">
            <li>Average logged: {stats.avgLoggedKcal} kcal across {stats.loggedDayCount} days</li>
            <li>Weight trend: {stats.observedRateKgPerWeek} kg per week from {stats.weighInCount} weigh-ins over {stats.spanDays} days</li>
          </ul>
        )}
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => onResolve(proposal.id, "accept")}
            disabled={busy}
            className="press flex-1 rounded-2xl bg-(--ink) px-4 py-3 text-sm font-medium text-(--ink-contrast) disabled:opacity-60"
          >
            {busy ? "Updating..." : "Update my target"}
          </button>
          <button
            onClick={() => onResolve(proposal.id, "dismiss")}
            disabled={busy}
            className="press rounded-2xl border border-(--border) bg-(--surface) px-4 py-3 text-sm text-(--ink) disabled:opacity-50"
          >
            Not now
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-(--muted)">
          Not now means we&apos;ll check again in a week.
        </p>
      </Card>
    );
  }

  if (cooldownUntil) {
    const when = new Date(cooldownUntil).toLocaleDateString(undefined, { month: "long", day: "numeric" });
    return (
      <Card title="Adaptive target">
        <p className="text-sm leading-6 text-(--ink-2)">
          You said not now, so the next check happens around {when}.
        </p>
      </Card>
    );
  }

  const onTrack =
    insufficientData.includes("no_divergence") || insufficientData.includes("delta_too_small");
  if (onTrack) {
    return (
      <Card title="Adaptive target">
        <p className="text-sm leading-6 text-(--ink)">
          Your results match your plan. No change suggested.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Adaptive target">
      <p className="text-sm leading-6 text-(--ink-2)">
        Once there&apos;s about two weeks of weigh-ins and logs, Demi checks whether your target
        matches your real results.
      </p>
      <ul className="mt-3 space-y-1 text-sm text-(--ink-2)">
        <li>
          Weigh-ins: {Math.min(progress.weighInCount, progress.weighInsNeeded)} of {progress.weighInsNeeded}
          {progress.weighInCount >= progress.weighInsNeeded && progress.spanDays < progress.spanDaysNeeded
            ? ` (across at least ${progress.spanDaysNeeded} days)`
            : ""}
        </li>
        <li>
          Logged days: {Math.min(progress.loggedDayCount, progress.loggedDaysNeeded)} of {progress.loggedDaysNeeded} in the last 14
        </li>
      </ul>
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-(--surface) p-5 shadow-sm">
      <h2 className="mb-2 text-lg font-semibold text-(--ink)">{title}</h2>
      {children}
    </section>
  );
}
