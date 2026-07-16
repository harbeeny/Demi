"use client";

/**
 * Trailing week of tappable day pills, each with a progress ring of that
 * day's eaten calories against the target. Tapping a past day opens its
 * read-only review; tapping today returns home.
 */

import { kcalGoalMet } from "@/lib/log/goal";

interface Props {
  /** each day carries its own target: weekly balancing shifts them per-day */
  week: Array<{ date: string; kcal: number; targetKcal: number }>;
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

export function DayStrip({ week, selectedDate, onSelect }: Props) {
  return (
    <div className="mb-5 flex justify-between gap-1 px-0.5" role="group" aria-label="Past week">
      {week.map((d) => {
        const selected = d.date === selectedDate;
        const progress = d.targetKcal > 0 ? Math.min(1, d.kcal / d.targetKcal) : 0;
        const goalMet = kcalGoalMet(d.kcal, d.targetKcal);
        const dayNum = Number(d.date.slice(8, 10));
        return (
          <button
            key={d.date}
            onClick={() => onSelect(d.date)}
            aria-label={`${d.date}, ${Math.round(d.kcal)} kcal logged${goalMet ? ", goal met" : ""}`}
            aria-pressed={selected}
            className="press flex flex-col items-center gap-0.5"
          >
            <span className="relative flex h-9 w-9 items-center justify-center">
              <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
                <circle
                  cx="18"
                  cy="18"
                  r={RADIUS}
                  fill={selected ? "#2c3a2e" : goalMet ? "#eaf2dc" : "white"}
                  stroke="#dce3d7"
                  strokeWidth="3"
                />
                {/* Always mounted so today's arc grows when a log lands;
                    only the dash length transitions — the selection color
                    snaps together with the pill's fill flip. */}
                <circle
                  cx="18"
                  cy="18"
                  r={RADIUS}
                  fill="none"
                  stroke={selected ? "#d3e29f" : "#8aa06f"}
                  strokeWidth="3"
                  strokeLinecap="round"
                  transform="rotate(-90 18 18)"
                  className="transition-[stroke-dasharray] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
                  style={{
                    strokeDasharray: `${progress * CIRCUMFERENCE} ${CIRCUMFERENCE}`,
                    opacity: progress > 0 ? 1 : 0,
                  }}
                />
              </svg>
              <span
                className={`absolute text-[11px] font-medium ${
                  selected ? "text-white" : "text-[#2c3a2e]"
                }`}
              >
                {dayInitial(d.date)}
              </span>
              {goalMet && (
                <span
                  className="pop-in absolute -right-0.5 -top-0.5 flex h-[14px] w-[14px] items-center justify-center rounded-full bg-[#7a9a4e] ring-2 ring-[#f4f6f2]"
                  aria-hidden="true"
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
              )}
            </span>
            {/* Fixed width + tabular figures: the selected weight change must
                never shift the row's layout. */}
            <span
              className={`w-6 text-center text-[11px] tabular-nums ${
                selected ? "font-semibold text-[#2c3a2e]" : "text-[#829084]"
              }`}
            >
              {dayNum}
            </span>
          </button>
        );
      })}
    </div>
  );
}
