"use client";

import type { MacroTotals } from "@/lib/log/remaining";

/**
 * Remaining-first macro summary: a hero calories-left card and three macro
 * cards, each with a ring filling as the day is eaten. Counts down from the
 * targets; going over swaps the subtext rather than showing a negative.
 */

interface Props {
  targets: MacroTotals;
  eaten: MacroTotals;
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
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = Math.min(1, Math.max(0, progress));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
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
    </svg>
  );
}

function remainingParts(target: number, eaten: number): { value: number; over: boolean } {
  const left = Math.round(target - eaten);
  return left >= 0 ? { value: left, over: false } : { value: -left, over: true };
}

export function MacroSummary({ targets, eaten }: Props) {
  const kcal = remainingParts(targets.kcal, eaten.kcal);
  const macros = [
    { label: "Protein", ...remainingParts(targets.proteinG, eaten.proteinG), target: targets.proteinG, had: eaten.proteinG, color: "#b25d4c" },
    { label: "Carbs", ...remainingParts(targets.carbsG, eaten.carbsG), target: targets.carbsG, had: eaten.carbsG, color: "#c9a227" },
    { label: "Fat", ...remainingParts(targets.fatG, eaten.fatG), target: targets.fatG, had: eaten.fatG, color: "#5b7fa6" },
  ];

  return (
    <section aria-label="Remaining macros">
      <div className="flex items-center justify-between rounded-3xl bg-white p-5 shadow-sm">
        <div>
          <p className="text-4xl font-semibold tracking-tight text-[#2c3a2e]">
            {kcal.value.toLocaleString()}
          </p>
          <p className="mt-1 text-sm text-[#5d6b5f]">
            {kcal.over ? "Calories over target" : "Calories left"}
          </p>
        </div>
        <div className="relative flex items-center justify-center">
          <Ring
            progress={targets.kcal > 0 ? eaten.kcal / targets.kcal : 0}
            size={84}
            stroke={8}
            color={kcal.over ? "#b25d4c" : "#7a9a4e"}
          />
          <span aria-hidden="true" className="absolute text-lg">
            {kcal.over ? "◆" : "❋"}
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        {macros.map((m) => (
          <div key={m.label} className="rounded-3xl bg-white p-3 text-center shadow-sm">
            <p className="text-lg font-semibold text-[#2c3a2e]">{m.value}g</p>
            <p className="text-[11px] text-[#829084]">
              {m.label} {m.over ? "over" : "left"}
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
