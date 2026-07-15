"use client";

interface Props {
  days: Array<{ date: string; planned: boolean }>;
  selectedDate: string;
  onSelect: (date: string) => void;
}

/** Seven day pills; lime dot = planned, ring = today, tap selects. */
export function WeekStrip({ days, selectedDate, onSelect }: Props) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex justify-between gap-1">
      {days.map(({ date, planned }) => {
        const d = new Date(date + "T00:00:00Z");
        const selected = date === selectedDate;
        return (
          <button
            key={date}
            onClick={() => onSelect(date)}
            aria-pressed={selected}
            className={`press flex flex-1 flex-col items-center gap-1 rounded-2xl border py-2 ${
              selected
                ? "border-[#2c3a2e] bg-[#2c3a2e] text-white"
                : date === today
                  ? "border-[#8aa06f] bg-white text-[#2c3a2e]"
                  : "border-[#dce3d7] bg-white text-[#2c3a2e]"
            }`}
          >
            <span className="text-[10px] uppercase opacity-70">
              {d.toLocaleDateString(undefined, { weekday: "narrow", timeZone: "UTC" })}
            </span>
            <span className="text-sm font-medium">{d.getUTCDate()}</span>
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${
                planned ? "bg-[#d3e29f]" : selected ? "bg-white/30" : "bg-[#eef1ea]"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
