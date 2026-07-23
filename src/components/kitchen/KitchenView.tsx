"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { apiFetch, awaitPlanJob } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { device24HourClock, formatTimeHour } from "@/lib/dates";
import { applyPantry, effectiveOnHand, listHash, rollupGroceries } from "@/lib/plan/grocery";
import { logPurchase, pantryAdd, readPurchaseLog, unlogPurchase } from "@/lib/pantry";
import type { Budget } from "@/lib/supabase/types";
import { WeekStrip } from "./WeekStrip";
import { GroceryList } from "./GroceryList";
import { RecipeSheet, type RecipeData } from "./RecipeSheet";
import type { CoveredLine, GroceryLine, Ingredient } from "@/lib/plan/grocery";

const EXTRAS_KEY = "demi:grocery:extras";

interface GroceryExtra {
  name: string;
  ingredients: Ingredient[];
  servings: number;
}
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
  return formatTimeHour(timeHour, device24HourClock());
}

interface Props {
  data: KitchenData;
  onMutated: () => Promise<void>;
}

export function KitchenView({ data, onMutated }: Props) {
  const today = data.days[0]?.date ?? "";
  const [selectedDate, setSelectedDate] = useState(today);
  const [range, setRange] = useState<"today" | "week">("week");
  // Lazy reads, not mount effects: this view only mounts client-side (behind
  // the kitchen loading gate), and effect-syncs flashed the defaults for a
  // frame ("Any" before the stored prep cap) once tabs began painting
  // instantly from snapshots.
  const [maxPrepMin, setMaxPrepMin] = useState<number | undefined>(() => {
    try {
      const stored = localStorage.getItem(PREP_KEY);
      return stored ? Number(stored) || undefined : undefined;
    } catch {
      return undefined;
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recipe, setRecipe] = useState<RecipeData | null>(null);
  // Recipes added to the list by hand from the recipe sheet, beyond what the
  // plan rollup already covers. Device-local, like the check-offs.
  const [extras, setExtras] = useState<GroceryExtra[]>(() => {
    try {
      const stored = localStorage.getItem(EXTRAS_KEY);
      return stored ? (JSON.parse(stored) as GroceryExtra[]) : [];
    } catch {
      // unreadable extras: start clean
      return [];
    }
  });
  const saveExtras = (next: GroceryExtra[]) => {
    setExtras(next);
    try {
      localStorage.setItem(EXTRAS_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable: extras stay session-only
    }
  };
  const addRecipeToGroceries = (r: RecipeData) =>
    saveExtras([
      ...extras,
      { name: r.name, ingredients: r.ingredients, servings: r.servings },
    ]);


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
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        queued?: boolean;
        jobId?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't plan the week.");
      } else if (body.queued && body.jobId) {
        // The build runs server-side now; keep "Planning..." up while the
        // job finishes so the button stays honest.
        const job = await awaitPlanJob(body.jobId);
        if (!job.ok) setError(job.error ?? "Couldn't plan the week.");
        await onMutated();
      } else {
        await onMutated();
      }
    } catch {
      setError("Network hiccup. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const selectedDay = data.days.find((d) => d.date === selectedDate) ?? data.days[0];

  const groceryEntries = useMemo(() => {
    const days = range === "today" ? data.days.slice(0, 1) : data.days;
    return [
      ...days.flatMap((d) =>
        d.entries.map((e) => ({ ingredients: e.ingredients, servings: e.servings })),
      ),
      ...extras.map((x) => ({ ingredients: x.ingredients, servings: x.servings })),
    ];
  }, [data.days, range, extras]);

  // Raw rollup drives the check-off key: pantry coverage moving lines
  // around must never re-hash the list and wipe mid-shop checks.
  const sections = useMemo(() => rollupGroceries(groceryEntries), [groceryEntries]);
  const storageKey = `demi:grocery:${range}:${today}:${listHash(sections)}`;

  // Items tapped "I'm out" this session; cleared when fresh pantry data lands.
  const [outKeys, setOutKeys] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    setOutKeys(new Set());
  }, [data]);

  const { toBuy, covered, staleFor } = useMemo(() => {
    const { onHand, stale } = effectiveOnHand(sections, data.pantry, Date.now());
    // Purchases already checked off against THIS list don't cover this list;
    // subtracting them keeps the split identical across a mid-shop reload.
    const log = readPurchaseLog(storageKey);
    for (const [key, amount] of Object.entries(log)) {
      const have = onHand.get(key);
      if (have === undefined) continue;
      const left = have - amount;
      if (left > 0) onHand.set(key, left);
      else onHand.delete(key);
    }
    for (const key of outKeys) onHand.delete(key);
    return { ...applyPantry(sections, onHand), staleFor: stale };
  }, [sections, data.pantry, storageKey, outKeys]);

  /** A check-off is a purchase (or a "yep, have it"): the package amount
   *  lands in the pantry; un-checking takes exactly that amount back. */
  const handleToggleLine = (line: GroceryLine, nowChecked: boolean) => {
    const key = `${line.item}|${line.unit}`;
    const supabase = createClient();
    if (nowChecked) {
      // Buying fresh replaces expired stock instead of stacking on top of it.
      const staleQty = staleFor.get(key) ?? 0;
      if (staleQty > 0) void pantryAdd(supabase, { item: line.item, unit: line.unit, delta: -staleQty });
      void pantryAdd(supabase, { item: line.item, unit: line.unit, delta: line.buyQty });
      logPurchase(storageKey, key, line.buyQty);
      if (outKeys.has(key)) {
        setOutKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    } else {
      const logged = unlogPurchase(storageKey, key);
      void pantryAdd(supabase, { item: line.item, unit: line.unit, delta: -(logged ?? line.buyQty) });
    }
  };

  /** "I'm out": zero the pantry row and put the line back on the buy list. */
  const handleOutOf = (line: CoveredLine) => {
    const key = `${line.item}|${line.unit}`;
    setOutKeys((prev) => new Set(prev).add(key));
    const supabase = createClient();
    void supabase
      .from("pantry_items")
      .update({ qty: 0 })
      .eq("item", line.item)
      .eq("unit", line.unit)
      .then(({ error }) => {
        // Absolute zero failed (likely offline): fall back to a delta, which
        // parks itself in the outbox and replays later.
        if (error) void pantryAdd(supabase, { item: line.item, unit: line.unit, delta: -line.have });
      });
  };

  const openRecipe = (m: KitchenMeal) =>
    setRecipe({
      name: m.name,
      servings: m.servings,
      prepMin: m.prepMin,
      cookMin: m.cookMin,
      kcal: m.kcal,
      proteinG: m.proteinG,
      carbsG: m.carbsG,
      fatG: m.fatG,
      ingredients: m.ingredients,
      instructions: m.instructions,
      source: m.source,
    });


  const chip = (selected: boolean) =>
    `press rounded-full border px-4 py-2 text-sm ${
      selected
        ? "border-(--ink) bg-(--ink) text-(--ink-contrast)"
        : "border-(--border) bg-(--surface) text-(--ink) hover:border-(--accent)"
    }`;

  return (
    <main className="mx-auto w-full min-h-dvh max-w-md bg-(--bg) px-5 pb-28 pt-8">
      <header className="mb-6 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-(--accent-tint) font-semibold text-(--ink)">D</span>
        <h1 className="text-lg font-semibold leading-tight text-(--ink)">Kitchen</h1>
        {/* Kitchen is reached from the + sheet, not a tab, so it carries its
            own way back; matches the sheets' ghost close button. */}
        <Link
          href="/today"
          aria-label="Back to Today"
          className="press ml-auto flex h-9 w-9 items-center justify-center rounded-full text-(--muted) hover:bg-(--track) hover:text-(--ink)"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </Link>
      </header>

      {error && <p className="mb-4 rounded-2xl bg-(--danger-bg) p-3 text-sm text-(--danger-ink)">{error}</p>}

      <section className="mb-4 rounded-3xl bg-(--surface) p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-(--ink)">Max time</span>
          {PREP_CHOICES.map((c) => (
            <button key={c.label} className={chip(maxPrepMin === c.value)} onClick={() => setPrep(c.value)}>
              {c.label}
            </button>
          ))}
        </div>
        <p className="mb-3 text-xs text-(--muted)">
          Budget: {BUDGET_LABELS[data.budget]} per week ·{" "}
          <Link href="/profile" className="text-(--accent-strong) underline-offset-2 hover:underline">
            set in Profile
          </Link>
        </p>
        <button
          onClick={planWeek}
          disabled={busy}
          className="press w-full rounded-2xl bg-(--ink) px-5 py-3 font-medium text-(--ink-contrast) disabled:opacity-60"
        >
          {busy ? "Planning..." : "Plan my week"}
        </button>
      </section>

      <section className="mb-4 rounded-3xl bg-(--surface) p-5 shadow-sm">
        <WeekStrip
          days={data.days.map((d) => ({ date: d.date, planned: d.entries.length > 0 }))}
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
        />
        <div className="mt-4 space-y-2">
          {selectedDay.entries.length === 0 ? (
            <p className="text-sm text-(--muted)">Nothing planned this day yet.</p>
          ) : (
            selectedDay.entries.map((m, i) => (
              <button
                key={`${m.mealId}-${i}`}
                onClick={() => openRecipe(m)}
                className="press flex w-full items-center justify-between gap-3 rounded-2xl border border-(--control) bg-(--surface) px-4 py-3 text-left"
              >
                <span>
                  <span className="block text-xs uppercase tracking-wide text-(--muted)">
                    {m.slot} · {timeLabel(m.timeHour)}
                  </span>
                  <span className="mt-0.5 block text-sm font-medium text-(--ink)">{m.name}</span>
                </span>
                <span className="shrink-0 text-xs text-(--ink-2)">
                  {Math.round(m.kcal)} kcal · {m.prepMin + m.cookMin} min
                </span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="rounded-3xl bg-(--surface) p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-(--ink)">Groceries</h2>
          <div className="flex gap-1 rounded-full border border-(--border) p-0.5">
            {(["today", "week"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`press rounded-full px-3 py-1 text-xs ${
                  range === r ? "bg-(--ink) text-(--ink-contrast)" : "text-(--ink)"
                }`}
              >
                {r === "today" ? "Today" : "This week"}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-3 text-xs text-(--muted)">
          Amounts are what you grab at the store. Check off what you buy and
          Demi counts the leftovers toward next week.
        </p>
        {extras.length > 0 && (
          <p className="mb-2 flex items-center justify-between text-xs text-(--muted)">
            <span>
              Includes {extras.length} added {extras.length === 1 ? "recipe" : "recipes"}
            </span>
            <button
              onClick={() => saveExtras([])}
              className="text-(--accent-strong) underline-offset-2 hover:underline"
            >
              Clear
            </button>
          </p>
        )}
        <GroceryList
          sections={toBuy}
          covered={covered}
          storageKey={storageKey}
          onToggleLine={handleToggleLine}
          onOutOf={handleOutOf}
        />
      </section>

      <p className="mt-8 text-center text-xs leading-5 text-(--muted)">
        Demi offers general wellness guidance, not medical advice.
      </p>

      <RecipeSheet
        recipe={recipe}
        action={
          recipe
            ? {
                label: "Add ingredients to grocery list",
                doneLabel: "On your grocery list",
                done: extras.some((x) => x.name === recipe.name),
                run: () => addRecipeToGroceries(recipe),
              }
            : null
        }
        onClose={() => setRecipe(null)}
      />
    </main>
  );
}
