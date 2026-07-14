"use client";

interface Props {
  days: Array<{ date: string; totalKcal: number }>;
  targetKcal: number;
}

const W = 340;
const H = 150;
const PAD = { top: 16, right: 6, bottom: 22, left: 34 };

/**
 * Daily intake bars against a dashed target reference line. Single hue for
 * the bars (validated data green); the target is a neutral reference, not a
 * second series, so no legend is needed (it carries a direct label).
 */
export function IntakeChart({ days, targetKcal }: Props) {
  if (days.length === 0) {
    return <p className="text-sm text-[#829084]">Days you log meals show up here.</p>;
  }

  const shown = days.slice(-14);
  const maxKcal = Math.max(targetKcal * 1.15, ...shown.map((d) => d.totalKcal));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / shown.length;
  const barW = Math.min(18, Math.max(6, slot - 2)); // 2px surface gap between bars
  const y = (kcal: number) => PAD.top + (1 - kcal / maxKcal) * plotH;
  const shortDate = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`Daily intake over the last ${shown.length} logged days against the ${targetKcal} kcal target`}
    >
      {shown.map((d, i) => {
        const bx = PAD.left + i * slot + (slot - barW) / 2;
        const by = y(d.totalKcal);
        const h = Math.max(2, H - PAD.bottom - by);
        return (
          <rect key={d.date} x={bx} y={by} width={barW} height={h} rx="3" fill="#7a9a4e">
            <title>{`${shortDate(d.date)}: ${Math.round(d.totalKcal)} kcal`}</title>
          </rect>
        );
      })}
      {/* neutral target reference with direct label */}
      <line
        x1={PAD.left}
        x2={W - PAD.right}
        y1={y(targetKcal)}
        y2={y(targetKcal)}
        stroke="#829084"
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />
      <text x={PAD.left} y={y(targetKcal) - 4} fontSize="10" fill="#5d6b5f">
        target {targetKcal}
      </text>
      <text x={PAD.left} y={H - 6} fontSize="10" fill="#829084">
        {shortDate(shown[0].date)}
      </text>
      <text x={W - PAD.right} y={H - 6} fontSize="10" fill="#829084" textAnchor="end">
        {shortDate(shown[shown.length - 1].date)}
      </text>
    </svg>
  );
}
