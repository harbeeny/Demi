"use client";

import { useState } from "react";

import type { MacroTotals } from "@/lib/log/remaining";

export interface DaySummary {
  reflection: string;
  tweak: string;
  finishedAt: string;
  energy: number | null;
}

interface Props {
  logsCount: number;
  summary: DaySummary | null;
  planned: MacroTotals | null;
  actual: MacroTotals;
  busy: string | null;
  onFinish: (energy: number | null, note: string) => void;
}

/**
 * End-of-day flow. Before finishing: energy + optional note + the button.
 * After: planned vs actual in neutral ink (no judgment colors), the
 * reflection, and one tweak for tomorrow.
 */
export function SummaryCard({ logsCount, summary, planned, actual, busy, onFinish }: Props) {
  const [energy, setEnergy] = useState<number | null>(null);
  const [note, setNote] = useState("");

  if (logsCount === 0) return null;

  if (summary) {
    return (
      <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[#2c3a2e]">Your day</h2>
        <div className="mt-3 space-y-1 text-sm text-[#5d6b5f]">
          <Row label="" a="Planned" b="Eaten" header />
          <Row label="kcal" a={planned ? String(Math.round(planned.kcal)) : "-"} b={String(Math.round(actual.kcal))} />
          <Row label="Protein" a={planned ? `${Math.round(planned.proteinG)} g` : "-"} b={`${Math.round(actual.proteinG)} g`} />
          <Row label="Carbs" a={planned ? `${Math.round(planned.carbsG)} g` : "-"} b={`${Math.round(actual.carbsG)} g`} />
          <Row label="Fat" a={planned ? `${Math.round(planned.fatG)} g` : "-"} b={`${Math.round(actual.fatG)} g`} />
        </div>
        <p className="mt-4 rounded-2xl bg-[#e9efdd] p-4 text-sm leading-6 text-[#3c4a3e]">
          {summary.reflection}
        </p>
        <p className="mt-3 text-sm leading-6 text-[#2c3a2e]">
          <span className="font-medium">One tweak for tomorrow:</span> {summary.tweak}
        </p>
        <button
          onClick={() => onFinish(summary.energy, "")}
          disabled={busy !== null}
          className="mt-4 text-xs text-[#829084] underline-offset-2 hover:underline disabled:opacity-50"
        >
          {busy === "finish" ? "Updating..." : "Update summary"}
        </button>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-[#2c3a2e]">Finish my day</h2>
      <p className="mt-1 text-sm text-[#829084]">
        A short recap of planned vs eaten, and one idea for tomorrow.
      </p>
      <p className="mt-4 text-sm text-[#2c3a2e]">How was your energy today?</p>
      <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Energy today, 1 to 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={energy === n}
            onClick={() => setEnergy(energy === n ? null : n)}
            className={`press h-10 w-10 rounded-full border text-sm ${
              energy === n
                ? "border-[#2c3a2e] bg-[#2c3a2e] text-white"
                : "border-[#dce3d7] bg-white text-[#2c3a2e] hover:border-[#8aa06f]"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <input
        type="text"
        className="mt-3 w-full rounded-2xl border border-[#dce3d7] bg-white px-3 py-2 text-sm text-[#2c3a2e] outline-none focus:border-[#8aa06f]"
        placeholder="Anything about today? (optional)"
        maxLength={500}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button
        onClick={() => onFinish(energy, note)}
        disabled={busy !== null}
        className="press mt-4 w-full rounded-2xl bg-[#2c3a2e] px-5 py-3 font-medium text-white disabled:opacity-60"
      >
        {busy === "finish" ? "Wrapping up your day..." : "Finish my day"}
      </button>
    </section>
  );
}

function Row({ label, a, b, header = false }: { label: string; a: string; b: string; header?: boolean }) {
  return (
    <div className={`grid grid-cols-3 gap-2 ${header ? "text-xs uppercase tracking-wide text-[#829084]" : ""}`}>
      <span>{label}</span>
      <span className="text-right">{a}</span>
      <span className="text-right">{b}</span>
    </div>
  );
}
