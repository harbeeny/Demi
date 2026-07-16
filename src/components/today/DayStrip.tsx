"use client";

/**
 * Trailing week of tappable day pills, each with a progress ring of that
 * day's eaten calories against the target. Tapping a past day opens its
 * read-only review; tapping today returns home.
 */

interface Props {
  week: Array<{ date: string; kcal: number }>;
  targetKcal: number;
  selectedDate: string;
  onSelect: (date: string) => void;
}

const RADIUS = 13;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function dayInitial(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "narrow",
    timeZone: "UTC",
  });
}

export function DayStrip({ week, targetKcal, selectedDate, onSelect }: Props) {
  return (
    <div className="mb-5 flex justify-between gap-1" role="group" aria-label="Past week">
      {week.map((d) => {
        const selected = d.date === selectedDate;
        const progress = targetKcal > 0 ? Math.min(1, d.kcal / targetKcal) : 0;
        const dayNum = Number(d.date.slice(8, 10));
        return (
          <button
            key={d.date}
            onClick={() => onSelect(d.date)}
            aria-label={`${d.date}, ${Math.round(d.kcal)} kcal logged`}
            aria-pressed={selected}
            className="press flex flex-col items-center gap-0.5"
          >
            <span className="relative flex h-9 w-9 items-center justify-center">
              <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
                <circle
                  cx="18"
                  cy="18"
                  r={RADIUS}
                  fill={selected ? "#2c3a2e" : "white"}
                  stroke="#dce3d7"
                  strokeWidth="3"
                />
                {progress > 0 && (
                  <circle
                    cx="18"
                    cy="18"
                    r={RADIUS}
                    fill="none"
                    stroke={selected ? "#d3e29f" : "#8aa06f"}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${progress * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
                    transform="rotate(-90 18 18)"
                  />
                )}
              </svg>
              <span
                className={`absolute text-[11px] font-medium ${
                  selected ? "text-white" : "text-[#2c3a2e]"
                }`}
              >
                {dayInitial(d.date)}
              </span>
            </span>
            <span className={`text-[11px] ${selected ? "font-semibold text-[#2c3a2e]" : "text-[#829084]"}`}>
              {dayNum}
            </span>
          </button>
        );
      })}
    </div>
  );
}
