"use client";

import { useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { scaleMacros, type FdcFood } from "@/lib/food/fdc";

export interface FdcLogFields {
  fdcId: number;
  name: string;
  grams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

interface RecentFood {
  fdcId: number;
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

interface Props {
  busy: string | null;
  onLog: (fields: FdcLogFields, note: string) => void;
}

const input =
  "w-full rounded-2xl border border-[#dce3d7] bg-white px-3 py-2 text-sm text-[#2c3a2e] outline-none focus:border-[#8aa06f]";

/** USDA FoodData Central search with portion-aware logging. */
export function FoodSearch({ busy, onLog }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FdcFood[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<FdcFood | null>(null);
  const [grams, setGrams] = useState(100);
  const [note, setNote] = useState("");
  const [recents, setRecents] = useState<RecentFood[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Monotonic id per query: a slow, older fetch must never clobber the
  // results of a newer one (it read as "search didn't recognize the word").
  const searchSeq = useRef(0);

  // Touching the results area drops the keyboard so more of the list shows;
  // the OS animates it down on blur. Touches on the field or its clear button
  // are exempt, and desktop pointers never blur (no keyboard to dismiss).
  const dismissKeyboard = (e: React.TouchEvent) => {
    const input = inputRef.current;
    if (!input || document.activeElement !== input) return;
    if ((e.target as HTMLElement).closest("[data-search-controls]")) return;
    input.blur();
  };

  const clearSearch = () => {
    setQuery("");
    setMessage("");
    // Refocus in the same tap so iOS reopens the keyboard for the next word.
    inputRef.current?.focus();
  };

  // Recent FDC foods for one-tap re-logging (macros were snapshotted at log
  // time, so re-logging costs zero API calls).
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("meal_logs")
        .select("fdc_id, name, kcal, protein_g, carbs_g, fat_g")
        .eq("user_id", user.id)
        .eq("source", "fdc")
        .order("logged_at", { ascending: false })
        .limit(30);
      const seen = new Set<number>();
      const distinct: RecentFood[] = [];
      for (const row of data ?? []) {
        if (row.fdc_id === null || seen.has(row.fdc_id)) continue;
        seen.add(row.fdc_id);
        distinct.push({
          fdcId: row.fdc_id,
          name: row.name,
          kcal: Number(row.kcal),
          proteinG: Number(row.protein_g),
          carbsG: Number(row.carbs_g),
          fatG: Number(row.fat_g),
        });
        if (distinct.length >= 8) break;
      }
      setRecents(distinct);
    })();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    const id = ++searchSeq.current;
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      setMessage("");
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/food/search?q=${encodeURIComponent(q)}`);
        const data = (await res.json().catch(() => ({}))) as {
          foods?: FdcFood[];
          error?: string;
        };
        if (id !== searchSeq.current) return; // a newer query owns the UI
        if (!res.ok) {
          setMessage(data.error ?? "Search failed. Try again.");
          setResults([]);
        } else {
          setMessage(data.foods?.length ? "" : "No matches. Try different words.");
          setResults(data.foods ?? []);
        }
      } catch {
        if (id !== searchSeq.current) return;
        setMessage("Network hiccup. Try again.");
      } finally {
        if (id === searchSeq.current) setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  if (selected) {
    const macros = scaleMacros(selected.per100g, grams);
    return (
      <div>
        <button
          onClick={() => setSelected(null)}
          className="mb-2 text-xs text-[#829084] underline-offset-2 hover:underline"
        >
          Back to results
        </button>
        <p className="text-sm font-medium text-[#2c3a2e]">{selected.description}</p>
        {selected.brand && <p className="text-xs text-[#829084]">{selected.brand}</p>}

        <div className="mt-3 flex flex-wrap gap-2">
          {selected.portions.map((p) => (
            <button
              key={p.label}
              onClick={() => setGrams(Math.round(p.gramWeight))}
              className={`press rounded-full border px-3 py-1.5 text-xs ${
                Math.abs(grams - p.gramWeight) < 1
                  ? "border-[#2c3a2e] bg-[#2c3a2e] text-white"
                  : "border-[#dce3d7] bg-white text-[#2c3a2e]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="mt-2 block text-xs text-[#829084]">
          Grams
          <input
            type="number"
            min={1}
            max={2000}
            inputMode="numeric"
            className={`${input} mt-1`}
            value={grams}
            onChange={(e) => setGrams(Math.max(1, Math.min(2000, Number(e.target.value) || 0)))}
          />
        </label>

        <p className="mt-2 text-sm text-[#5d6b5f]">
          {macros.kcal} kcal · P {macros.proteinG}g · C {macros.carbsG}g · F {macros.fatG}g
        </p>

        <input
          type="text"
          className={`${input} mt-3`}
          placeholder="Optional note (how it felt, mood, energy)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          onClick={() =>
            onLog(
              {
                fdcId: selected.fdcId,
                name: selected.description,
                grams,
                ...macros,
              },
              note,
            )
          }
          disabled={busy !== null || macros.kcal <= 0}
          className="press mt-3 w-full rounded-2xl bg-[#2c3a2e] px-5 py-3 font-medium text-white disabled:opacity-60"
        >
          {busy === "log-fdc" ? "Logging..." : `Log ${grams} g`}
        </button>
      </div>
    );
  }

  return (
    <div onTouchStart={dismissKeyboard}>
      <div className="relative" data-search-controls>
        <input
          ref={inputRef}
          type="text"
          className={`${input} pr-10`}
          placeholder="Search foods, e.g. greek yogurt"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        {query.length > 0 && (
          <button
            onClick={clearSearch}
            onMouseDown={(e) => e.preventDefault()}
            aria-label="Clear search"
            className="press absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-[#eef1ea] text-[#5d6b5f] hover:bg-[#e2e8dc] hover:text-[#2c3a2e]"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>
      {searching && <p className="mt-2 text-xs text-[#829084]">Searching...</p>}
      {message && !searching && <p className="mt-2 text-sm text-[#829084]">{message}</p>}

      {results.length === 0 && query.trim().length < 2 && recents.length > 0 && (
        <div className="mt-3">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-[#829084]">
            Recent foods
          </h3>
          <div className="space-y-2">
            {recents.map((r) => (
              <button
                key={r.fdcId}
                onClick={() =>
                  onLog(
                    {
                      fdcId: r.fdcId,
                      // name already carries its portion suffix from the log
                      name: r.name.replace(/ \(\d+ g\)$/, ""),
                      grams: Number(r.name.match(/\((\d+) g\)$/)?.[1] ?? 0) || 100,
                      kcal: r.kcal,
                      proteinG: r.proteinG,
                      carbsG: r.carbsG,
                      fatG: r.fatG,
                    },
                    "",
                  )
                }
                disabled={busy !== null}
                className="press w-full rounded-2xl border border-[#dce3d7] bg-white p-3 text-left disabled:opacity-50"
              >
                <span className="block text-sm font-medium text-[#2c3a2e]">{r.name}</span>
                <span className="mt-0.5 block text-xs text-[#5d6b5f]">
                  {Math.round(r.kcal)} kcal · P {Math.round(r.proteinG)}g · log again
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {results.map((f) => {
          // Same default the portion picker preselects: the food's primary
          // household measure, falling back to 100 g.
          const defaultGrams = Math.round(f.portions[0]?.gramWeight ?? 100);
          const portionLabel = f.portions[0]?.label ?? "100 g";
          return (
            <div
              key={f.fdcId}
              className="flex items-center gap-2 rounded-2xl border border-[#dce3d7] bg-white p-3 hover:border-[#8aa06f]"
            >
              <button
                onClick={() => {
                  setSelected(f);
                  setGrams(defaultGrams);
                }}
                disabled={busy !== null}
                className="press min-w-0 flex-1 text-left disabled:opacity-50"
              >
                <span className="block truncate text-sm font-medium text-[#2c3a2e]">
                  {f.description}
                </span>
                <span className="mt-0.5 block text-xs text-[#5d6b5f]">
                  {f.brand ? `${f.brand} · ` : ""}
                  {Math.round(f.per100g.kcal)} kcal per 100 g
                </span>
              </button>
              <button
                onClick={() =>
                  onLog(
                    {
                      fdcId: f.fdcId,
                      name: f.description,
                      grams: defaultGrams,
                      ...scaleMacros(f.per100g, defaultGrams),
                    },
                    "",
                  )
                }
                disabled={busy !== null}
                aria-label={`Quick add ${f.description}, ${portionLabel}`}
                className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#dce3d7] text-[#2c3a2e] hover:border-[#8aa06f] hover:bg-[#f0f4ec] disabled:opacity-50"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-center text-[10px] text-[#829084]">
        Food data: USDA FoodData Central
      </p>
    </div>
  );
}
