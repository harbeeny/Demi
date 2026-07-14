"use client";

export interface TodayMeal {
  slotIndex: number;
  slot: string;
  timeHour: number;
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  why: string;
}

export function timeLabel(timeHour: number): string {
  const h = Math.floor(timeHour);
  const m = Math.round((timeHour % 1) * 60);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

interface Props {
  meal: TodayMeal;
  /** id of this slot's log row when the user has confirmed eating it */
  loggedId: string | null;
  busy: string | null;
  onConfirm: (slotIndex: number) => void;
  onUndo: (logId: string) => void;
  onSwap: (slotIndex: number) => void;
}

export function MealCard({ meal, loggedId, busy, onConfirm, onUndo, onSwap }: Props) {
  const logged = loggedId !== null;

  return (
    <article
      className={`relative rounded-3xl bg-white p-4 shadow-sm ${
        logged ? "border-l-4 border-[#d3e29f]" : ""
      }`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-[#829084]">
          {meal.slot} · {timeLabel(meal.timeHour)}
        </span>
        {!logged && (
          <button
            onClick={() => onSwap(meal.slotIndex)}
            disabled={busy !== null}
            className="text-xs text-[#7a9a4e] underline-offset-2 hover:underline disabled:opacity-50"
          >
            {busy === `swap-${meal.slotIndex}` ? "Swapping..." : "Swap"}
          </button>
        )}
      </div>
      <h2 className="mt-1 font-medium text-[#2c3a2e]">
        {logged && <span aria-hidden className="mr-1 text-[#7a9a4e]">✓</span>}
        {meal.name}
      </h2>
      <div className="mt-2 flex gap-3 text-xs text-[#5d6b5f]">
        <span>{Math.round(meal.kcal)} kcal</span>
        <span>P {Math.round(meal.proteinG)}g</span>
        <span>C {Math.round(meal.carbsG)}g</span>
        <span>F {Math.round(meal.fatG)}g</span>
      </div>
      {meal.why && <p className="mt-2 text-sm leading-5 text-[#5d6b5f]">{meal.why}</p>}
      <div className="mt-3">
        {logged ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-[#5d6b5f]">Logged</span>
            <button
              onClick={() => onUndo(loggedId)}
              disabled={busy !== null}
              className="text-xs text-[#829084] underline-offset-2 hover:underline disabled:opacity-50"
            >
              Undo
            </button>
          </div>
        ) : (
          <button
            onClick={() => onConfirm(meal.slotIndex)}
            disabled={busy !== null}
            className="press rounded-full border border-[#dce3d7] bg-white px-4 py-2 text-sm text-[#2c3a2e] hover:border-[#8aa06f] disabled:opacity-50"
          >
            {busy === `log-${meal.slotIndex}` ? "Logging..." : "I ate this"}
          </button>
        )}
      </div>
    </article>
  );
}
