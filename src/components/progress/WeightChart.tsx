"use client";

import { kgToLbs } from "@/lib/units";

interface Props {
  weighIns: Array<{ date: string; weightKg: number }>;
}

const W = 340;
const H = 150;
const PAD = { top: 14, right: 44, bottom: 22, left: 10 };

/**
 * Single-series weight trend line (lbs). One series: the title names it, no
 * legend (dataviz). Marks in the validated data green; text in ink tokens.
 * First and latest points are direct-labeled; every dot has a native tooltip.
 */
export function WeightChart({ weighIns }: Props) {
  if (weighIns.length < 2) {
    return (
      <p className="text-sm text-(--muted)">
        Log a couple of weigh-ins and your trend appears here.
      </p>
    );
  }

  const t0 = Date.parse(weighIns[0].date);
  const t1 = Date.parse(weighIns[weighIns.length - 1].date);
  const lbs = weighIns.map((w) => kgToLbs(w.weightKg));
  const lo = Math.min(...lbs);
  const hi = Math.max(...lbs);
  const padLbs = Math.max(1, (hi - lo) * 0.15);
  const yLo = lo - padLbs;
  const yHi = hi + padLbs;

  const x = (date: string) =>
    PAD.left + ((Date.parse(date) - t0) / Math.max(1, t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (lb: number) => PAD.top + (1 - (lb - yLo) / (yHi - yLo)) * (H - PAD.top - PAD.bottom);

  const path = weighIns
    .map((w, i) => `${i === 0 ? "M" : "L"}${x(w.date).toFixed(1)},${y(kgToLbs(w.weightKg)).toFixed(1)}`)
    .join(" ");

  const first = weighIns[0];
  const last = weighIns[weighIns.length - 1];
  const deltaLbs = kgToLbs(last.weightKg) - kgToLbs(first.weightKg);
  const shortDate = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Weight from ${Math.round(kgToLbs(first.weightKg))} to ${Math.round(kgToLbs(last.weightKg))} lbs`}
      >
        {/* recessive grid: min and max only */}
        {[lo, hi].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--control)" strokeWidth="1" />
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--accent-strong)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {weighIns.map((w) => (
          <circle key={w.date} cx={x(w.date)} cy={y(kgToLbs(w.weightKg))} r="3.5" fill="var(--accent-strong)" stroke="var(--surface)" strokeWidth="2">
            <title>{`${shortDate(w.date)}: ${kgToLbs(w.weightKg).toFixed(1)} lbs`}</title>
          </circle>
        ))}
        {/* direct labels: first and latest */}
        <text x={x(first.date)} y={y(kgToLbs(first.weightKg)) - 8} fontSize="10" fill="var(--ink-2)" textAnchor="start">
          {kgToLbs(first.weightKg).toFixed(1)}
        </text>
        <text x={x(last.date) + 8} y={y(kgToLbs(last.weightKg)) + 3} fontSize="11" fontWeight="600" fill="var(--ink)" textAnchor="start">
          {kgToLbs(last.weightKg).toFixed(1)}
        </text>
        {/* x labels: ends only */}
        <text x={PAD.left} y={H - 6} fontSize="10" fill="var(--muted)">{shortDate(first.date)}</text>
        <text x={W - PAD.right} y={H - 6} fontSize="10" fill="var(--muted)" textAnchor="end">{shortDate(last.date)}</text>
      </svg>
      <p className="mt-1 text-xs text-(--muted)">
        {deltaLbs === 0
          ? "Holding steady over this period."
          : `${deltaLbs > 0 ? "Up" : "Down"} ${Math.abs(deltaLbs).toFixed(1)} lbs over this period.`}
      </p>
    </div>
  );
}
