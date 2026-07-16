"use client";

import { useId, useState } from "react";

import type { MacroTotals } from "@/lib/log/remaining";
import { tapHaptic } from "@/lib/haptics";

/**
 * Macro summary: a hero calories card and three macro cards, each with a
 * ring filling as the day is eaten. The toggle in the hero's corner cycles
 * three readings of the same numbers: remaining (default), eaten totals,
 * and percent of target. The choice persists across days.
 */

interface Props {
  targets: MacroTotals;
  eaten: MacroTotals;
}

type MacroView = "left" | "eaten" | "percent";

const VIEW_KEY = "demi:macroView";
const NEXT_VIEW: Record<MacroView, MacroView> = { left: "eaten", eaten: "percent", percent: "left" };
const VIEW_LABELS: Record<MacroView, string> = { left: "Left", eaten: "Eaten", percent: "% Target" };

function pct(had: number, target: number): number {
  return target > 0 ? Math.round((had / target) * 100) : 0;
}

function Ring({
  progress,
  size,
  stroke,
  color,
}: {
  progress: number;
  size: number;
  stroke: number;
  color: string;
}) {
  // useId contains colons, which break url(#...) pattern references.
  const pid = `over${useId().replace(/:/g, "")}`;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = Math.min(1, Math.max(0, progress));
  // Second lap: how far past the target the day went, capped at one
  // full extra ring (200%). Drawn on top in striped amber so overshoot
  // reads as a distinct layer instead of silently pinning at full.
  const over = Math.min(1, Math.max(0, progress - 1));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <defs>
        <pattern
          id={pid}
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="4" height="4" fill="#d9a521" />
          <rect width="2" height="4" fill="#f2cf6b" />
        </pattern>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e6ebe0" strokeWidth={stroke} />
      {/* Always mounted so value changes transition (the arc grows when a
          log lands); a fresh mount would jump straight to the new value.
          Opacity hides the dot a zero-length round-cap dash would paint. */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-[stroke-dasharray,stroke] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
        style={{ strokeDasharray: `${filled * c} ${c}`, opacity: filled > 0 ? 1 : 0 }}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={`url(#${pid})`}
        strokeWidth={stroke}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-[stroke-dasharray] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
        style={{ strokeDasharray: `${over * c} ${c}`, opacity: over > 0 ? 1 : 0 }}
      />
    </svg>
  );
}

function remainingParts(target: number, eaten: number): { value: number; over: boolean } {
  const left = Math.round(target - eaten);
  return left >= 0 ? { value: left, over: false } : { value: -left, over: true };
}

export function MacroSummary({ targets, eaten }: Props) {
  // TodayView mounts client-side only (behind the loading gate), so the
  // initializer can read storage without a hydration mismatch.
  const [view, setView] = useState<MacroView>(() => {
    try {
      const stored = localStorage.getItem(VIEW_KEY);
      return stored === "eaten" || stored === "percent" ? stored : "left";
    } catch {
      return "left";
    }
  });

  const cycleView = () => {
    tapHaptic();
    setView((prev) => {
      const next = NEXT_VIEW[prev];
      try {
        localStorage.setItem(VIEW_KEY, next);
      } catch {
        // storage unavailable: the toggle still works for this visit
      }
      return next;
    });
  };

  const kcal = remainingParts(targets.kcal, eaten.kcal);
  const macros = [
    { label: "Protein", ...remainingParts(targets.proteinG, eaten.proteinG), target: targets.proteinG, had: eaten.proteinG, color: "#b25d4c" },
    { label: "Carbs", ...remainingParts(targets.carbsG, eaten.carbsG), target: targets.carbsG, had: eaten.carbsG, color: "#c9a227" },
    { label: "Fat", ...remainingParts(targets.fatG, eaten.fatG), target: targets.fatG, had: eaten.fatG, color: "#5b7fa6" },
  ];

  const heroValue =
    view === "left"
      ? kcal.value.toLocaleString()
      : view === "eaten"
        ? Math.round(eaten.kcal).toLocaleString()
        : `${pct(eaten.kcal, targets.kcal)}%`;
  const heroSub =
    view === "left"
      ? kcal.over
        ? "Calories over target"
        : "Calories left"
      : view === "eaten"
        ? "Calories eaten"
        : "Of calorie target";

  return (
    <section aria-label="Macro summary">
      <div className="relative flex items-center justify-between rounded-3xl bg-white p-5 shadow-sm">
        <button
          onClick={cycleView}
          aria-label={`Showing ${VIEW_LABELS[view].toLowerCase()} values. Switch view.`}
          className="press absolute right-3 top-3 flex items-center gap-1 rounded-full border border-[#dce3d7] bg-white px-2.5 py-1 text-[11px] font-medium text-[#5d6b5f] hover:border-[#8aa06f]"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17 2v6h-6" />
            <path d="M7 22v-6h6" />
            <path d="M17 8a8 8 0 0 0-14 4M7 16a8 8 0 0 0 14-4" />
          </svg>
          {VIEW_LABELS[view]}
        </button>
        <div>
          <p className="text-4xl font-semibold tracking-tight text-[#2c3a2e]">{heroValue}</p>
          <p className="mt-1 text-sm text-[#5d6b5f]">{heroSub}</p>
        </div>
        <div className="relative mt-4 flex items-center justify-center">
          {/* Base stays green even when over: the striped layer carries the
              overshoot now, so a red full ring would double-signal. */}
          <Ring
            progress={targets.kcal > 0 ? eaten.kcal / targets.kcal : 0}
            size={84}
            stroke={8}
            color="#7a9a4e"
          />
          <span aria-hidden="true" className="absolute text-lg">
            {kcal.over ? "◆" : "❋"}
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        {macros.map((m) => (
          <div key={m.label} className="rounded-3xl bg-white p-3 text-center shadow-sm">
            <p className="text-lg font-semibold text-[#2c3a2e]">
              {view === "left"
                ? `${m.value}g`
                : view === "eaten"
                  ? `${Math.round(m.had)}g`
                  : `${pct(m.had, m.target)}%`}
            </p>
            <p className="text-[11px] text-[#829084]">
              {view === "left"
                ? `${m.label} ${m.over ? "over" : "left"}`
                : view === "eaten"
                  ? `${m.label} eaten`
                  : m.label}
            </p>
            <div className="mt-2 flex justify-center">
              <Ring
                progress={m.target > 0 ? m.had / m.target : 0}
                size={44}
                stroke={5}
                color={m.color}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
