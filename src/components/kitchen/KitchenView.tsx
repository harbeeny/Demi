"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { apiFetch } from "@/lib/api";
import { listHash, rollupGroceries } from "@/lib/plan/grocery";
import type { Budget } from "@/lib/supabase/types";
import { WeekStrip } from "./WeekStrip";
import { GroceryList } from "./GroceryList";
import { RecipeSheet, type RecipeData } from "./RecipeSheet";
import type { KitchenData, KitchenMeal } from "./useKitchenData";

const PREP_CHOICES = [
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "45 min", value: 45 },
  { label: "Any", value: undefined },
] as const;

const PREP_KEY = "demi:kitchen:maxPrepMin";
const BUDGET_LABELS: Record<Budget, string> = { low: "$20-50", medium: "$50-100", high: "$100+" };

function timeLabel(timeHour: number): string {
  const h = Math.floor(timeHour);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${h >= 12 ? "pm" : "am"}`;
}

interface Props {
  data: KitchenData;
  onMutated: () => Promise<void>;
}

export function KitchenView({ data, onMutated }: Props) {
  const today = data.days[0]?.date ?? "";
  const [selectedDate, setSelectedDate] = useState(today);
  const [range, setRange] = useState<"today" | "week">("week");
  const [maxPrepMin, setMaxPrepMin] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recipe, setRecipe] = useState<RecipeData | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PREP_KEY);
      if (stored) setMaxPrepMin(Number(stored) || undefined);
    } catch {
      // storage unavailable
    }
  }, []);

  const setPrep = (value: number | undefined) => {
    setMaxPrepMin(value);
    try {
      if (value) localStorage.setItem(PREP_KEY, String(value));
      else localStorage.removeItem(PREP_KEY);
    } catch {
      // ignore
    }
  };

  async function planWeek() {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/plan/week", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(maxPrepMin ? { maxPrepMin } : {}),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(body.error ?? "Couldn't plan the week.");
      else await onMutated();
    } catch {
      setError("Network hiccup. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const selectedDay = data.days.find((d) => d.date === selectedDate) ?? data.days[0];

  const groceryEntries = useMemo(() => {
    const days = range === "today" ? data.days.slice(0, 1) : data.days;
    return days.flatMap((d) =>
      d.entries.map((e) => ({ ingredients: e.ingredients, servings: e.servings })),
    );
  }, [data.days, range]);

  const sections = useMemo(() => rollupGroceries(groceryEntries), [groceryEntries]);
  const storageKey = `demi:grocery:${range}:${today}:${listHash(sections)}`;

  const openRecipe = (m: KitchenMeal) =>
    setRecipe({
      name: m.name,
      servings: m.servings,
      prepMin: m.prepMin,
      cookMin: m.cookMin,
      kcal: m.kcal,
      proteinG: m.proteinG,
      ingredients: m.ingredients,
      instructions: m.instructions,
      source: m.source,
    });

  const chip = (selected: boolean) =>
    `press rounded-full border px-4 py-2 text-sm ${
      selected
        ? "border-[#2c3a2e] bg-[#2c3a2e] text-white"
        : "border-[#dce3d7] bg-white text-[#2c3a2e] hover:border-[#8aa06f]"
    }`;

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-[#f4f6f2] px-5 pb-28 pt-8">
      <header className="mb-6 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#d3e29f] font-semibold text-[#2c3a2e]">D</span>
        <h1 className="text-lg font-semibold leading-tight text-[#2c3a2e]">Kitchen</h1>
      </header>

      {error && <p className="mb-4 rounded-2xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-[#2c3a2e]">Max time</span>
          {PREP_CHOICES.map((c) => (
            <button key={c.label} className={chip(maxPrepMin === c.value)} onClick={() => setPrep(c.value)}>
              {c.label}
            </button>
          ))}
        </div>
        <p className="mb-3 text-xs text-[#829084]">
          Budget: {BUDGET_LABELS[data.budget]} per week ·{" "}
          <Link href="/profile" className="text-[#7a9a4e] underline-offset-2 hover:underline">
            set in Profile
          </Link>
        </p>
        <button
          onClick={planWeek}
          disabled={busy}
          className="press w-full rounded-2xl bg-[#2c3a2e] px-5 py-3 font-medium text-white disabled:opacity-60"
        >
          {busy ? "Planning..." : "Plan my week"}
        </button>
      </section>

      <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm">
        <WeekStrip
          days={data.days.map((d) => ({ date: d.date, planned: d.entries.length > 0 }))}
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
        />
        <div className="mt-4 space-y-2">
          {selectedDay.entries.length === 0 ? (
            <p className="text-sm text-[#829084]">Nothing planned this day yet.</p>
          ) : (
            selectedDay.entries.map((m, i) => (
              <button
                key={`${m.mealId}-${i}`}
                onClick={() => openRecipe(m)}
                className="press flex w-full items-center justify-between gap-3 rounded-2xl border border-[#eef1ea] bg-white px-4 py-3 text-left"
              >
                <span>
                  <span className="block text-xs uppercase tracking-wide text-[#829084]">
                    {m.slot} · {timeLabel(m.timeHour)}
                  </span>
                  <span className="mt-0.5 block text-sm font-medium text-[#2c3a2e]">{m.name}</span>
                </span>
                <span className="shrink-0 text-xs text-[#5d6b5f]">
                  {Math.round(m.kcal)} kcal · {m.prepMin + m.cookMin} min
                </span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#2c3a2e]">Groceries</h2>
          <div className="flex gap-1 rounded-full border border-[#dce3d7] p-0.5">
            {(["today", "week"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`press rounded-full px-3 py-1 text-xs ${
                  range === r ? "bg-[#2c3a2e] text-white" : "text-[#2c3a2e]"
                }`}
              >
                {r === "today" ? "Today" : "This week"}
              </button>
            ))}
          </div>
        </div>
        <GroceryList sections={sections} storageKey={storageKey} />
      </section>

      <p className="mt-8 text-center text-xs leading-5 text-[#829084]">
        Demi offers general wellness guidance, not medical advice.
      </p>

      <RecipeSheet recipe={recipe} onClose={() => setRecipe(null)} />
    </main>
  );
}
