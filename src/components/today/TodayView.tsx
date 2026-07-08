"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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

interface Props {
  hasPlan: boolean;
  daySummary: string;
  meals: TodayMeal[];
  targets: { kcal: number; proteinG: number; carbsG: number; fatG: number };
}

function timeLabel(timeHour: number): string {
  const h = Math.floor(timeHour);
  const m = Math.round((timeHour % 1) * 60);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function TodayView({ hasPlan, daySummary, meals, targets }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function callPlanApi(init: RequestInit, busyKey: string) {
    setBusy(busyKey);
    setError("");
    try {
      const res = await fetch("/api/plan", init);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Something went wrong.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Network hiccup. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const generate = (regenerate: boolean) =>
    callPlanApi(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ regenerate }),
      },
      "generate",
    );

  const swap = (slotIndex: number) =>
    callPlanApi(
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slotIndex }),
      },
      `swap-${slotIndex}`,
    );

  const planned = {
    kcal: meals.reduce((a, m) => a + m.kcal, 0),
    proteinG: meals.reduce((a, m) => a + m.proteinG, 0),
    carbsG: meals.reduce((a, m) => a + m.carbsG, 0),
    fatG: meals.reduce((a, m) => a + m.fatG, 0),
  };

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-[#f4f6f2] px-5 pb-24 pt-8">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#d3e29f] font-semibold text-[#2c3a2e]">D</span>
          <div>
            <h1 className="text-lg font-semibold leading-tight text-[#2c3a2e]">Today</h1>
            <p className="text-xs text-[#829084]">
              {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
        </div>
        {hasPlan && (
          <button
            onClick={() => generate(true)}
            disabled={busy !== null}
            className="press rounded-full border border-[#dce3d7] bg-white px-4 py-2 text-sm text-[#2c3a2e] hover:border-[#8aa06f] disabled:opacity-50"
          >
            {busy === "generate" ? "Working..." : "Regenerate"}
          </button>
        )}
      </header>

      {error && <p className="mb-4 rounded-2xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {!hasPlan ? (
        <div className="mt-16 text-center">
          <p className="text-[#2c3a2e]">No plan for today yet.</p>
          <button
            onClick={() => generate(false)}
            disabled={busy !== null}
            className="press mt-4 rounded-2xl bg-[#2c3a2e] px-6 py-3 font-medium text-white disabled:opacity-60"
          >
            {busy === "generate" ? "Building your day..." : "Build today's plan"}
          </button>
        </div>
      ) : (
        <>
          {/* Macro rings */}
          <section className="mb-6 grid grid-cols-4 gap-2 rounded-3xl bg-white p-4 shadow-sm">
            <MacroRing label="kcal" value={planned.kcal} target={targets.kcal} color="#2c3a2e" />
            <MacroRing label="protein" value={planned.proteinG} target={targets.proteinG} color="#7a9a4e" unit="g" />
            <MacroRing label="carbs" value={planned.carbsG} target={targets.carbsG} color="#c9a44c" unit="g" />
            <MacroRing label="fat" value={planned.fatG} target={targets.fatG} color="#a4785c" unit="g" />
          </section>

          {daySummary && (
            <p className="mb-6 rounded-3xl bg-[#e9efdd] p-4 text-sm leading-6 text-[#3c4a3e]">{daySummary}</p>
          )}

          {/* Timeline */}
          <section className="space-y-4">
            {meals.map((meal) => (
              <article key={meal.slotIndex} className="relative rounded-3xl bg-white p-4 shadow-sm">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-[#829084]">
                    {meal.slot} · {timeLabel(meal.timeHour)}
                  </span>
                  <button
                    onClick={() => swap(meal.slotIndex)}
                    disabled={busy !== null}
                    className="text-xs text-[#7a9a4e] underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    {busy === `swap-${meal.slotIndex}` ? "Swapping..." : "Swap"}
                  </button>
                </div>
                <h2 className="mt-1 font-medium text-[#2c3a2e]">{meal.name}</h2>
                <div className="mt-2 flex gap-3 text-xs text-[#5d6b5f]">
                  <span>{Math.round(meal.kcal)} kcal</span>
                  <span>P {Math.round(meal.proteinG)}g</span>
                  <span>C {Math.round(meal.carbsG)}g</span>
                  <span>F {Math.round(meal.fatG)}g</span>
                </div>
                {meal.why && <p className="mt-2 text-sm leading-5 text-[#5d6b5f]">{meal.why}</p>}
              </article>
            ))}
          </section>
        </>
      )}

      <p className="mt-10 text-center text-xs leading-5 text-[#829084]">
        Demi offers general wellness guidance, not medical advice.
      </p>
    </main>
  );
}

function MacroRing({
  label,
  value,
  target,
  color,
  unit = "",
}: {
  label: string;
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
      <svg width="68" height="68" viewBox="0 0 68 68" role="img" aria-label={`${label}: ${Math.round(value)} of ${target}${unit}`}>
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
