"use client";

import { useEffect, useState } from "react";

import type { MacroTotals } from "@/lib/log/remaining";
import { remainingBudget, remainingCopy } from "@/lib/log/remaining";

interface Props {
  /** what the plan delivers; shown before anything is logged */
  planned: MacroTotals;
  /** totals actually logged today; null until the first log */
  eaten: MacroTotals | null;
  targets: MacroTotals;
}

/**
 * The four macro rings. Before any log they show the plan against targets;
 * once something is logged they switch to eaten-vs-target with a neutral
 * line about what's left (SAFETY: informative, never gamified).
 */
export function MacroRings({ planned, eaten, targets }: Props) {
  const values = eaten ?? planned;
  const mode = eaten ? "eaten" : "planned";

  return (
    <section className="mb-6 rounded-3xl bg-white p-4 shadow-sm">
      <div className="grid grid-cols-4 gap-2">
        <MacroRing label="kcal" mode={mode} value={values.kcal} target={targets.kcal} color="#2c3a2e" />
        <MacroRing label="protein" mode={mode} value={values.proteinG} target={targets.proteinG} color="#7a9a4e" unit="g" />
        <MacroRing label="carbs" mode={mode} value={values.carbsG} target={targets.carbsG} color="#c9a44c" unit="g" />
        <MacroRing label="fat" mode={mode} value={values.fatG} target={targets.fatG} color="#a4785c" unit="g" />
      </div>
      {eaten && (
        <p className="mt-3 text-center text-sm text-[#829084]">
          {remainingCopy(remainingBudget(targets, eaten))}
        </p>
      )}
    </section>
  );
}

function MacroRing({
  label,
  mode,
  value,
  target,
  color,
  unit = "",
}: {
  label: string;
  mode: "planned" | "eaten";
  value: number;
  target: number;
  color: string;
  unit?: string;
}) {
  const pct = Math.min(1, target > 0 ? value / target : 0);
  const r = 26;
  const c = 2 * Math.PI * r;

  // Rings draw in on first view: decorative, once per visit, so animation
  // is allowed (emil-design-eng frequency rule). Starts empty, fills to pct.
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="flex flex-col items-center">
      <svg
        width="68"
        height="68"
        viewBox="0 0 68 68"
        role="img"
        aria-label={`${label} ${mode}: ${Math.round(value)} of ${target}${unit}`}
      >
        <circle cx="34" cy="34" r={r} fill="none" stroke="#eef1ea" strokeWidth="6" />
        <circle
          cx="34" cy="34" r={r} fill="none"
          stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={drawn ? c * (1 - pct) : c}
          transform="rotate(-90 34 34)"
          style={{ transition: "stroke-dashoffset 600ms var(--ease-out)" }}
        />
        <text x="34" y="38" textAnchor="middle" fontSize="13" fontWeight="600" fill="#2c3a2e">
          {Math.round(value)}
        </text>
      </svg>
      <span className="mt-1 text-[10px] text-[#829084]">
        {label} / {target}{unit}
      </span>
    </div>
  );
}
