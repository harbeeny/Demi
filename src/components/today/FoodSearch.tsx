"use client";

import { useEffect, useRef, useState } from "react";

import { Capacitor } from "@capacitor/core";

import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import {
  GRAMS_PER_OZ,
  isBarcodeQuery,
  isVerifiedSource,
  scaleMacros,
  type FdcFood,
} from "@/lib/food/fdc";

export interface FdcLogFields {
  fdcId: number;
  name: string;
  grams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  verified: boolean;
}

interface RecentFood {
  /** dedupe identity: fdc id, meal id, or the name itself */
  key: string;
  source: "fdc" | "db" | "planned" | "estimate";
  fdcId: number | null;
  mealId: string | null;
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  verified: boolean;
}

/** Green check for nutrition data from a curated, dietitian-grade source. */
export function VerifiedBadge() {
  return (
    <span
      role="img"
      aria-label="Verified nutrition data"
      title="Verified nutrition data"
      className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[#3e7a46] align-[-2px]"
    >
      <svg
        width="8"
        height="8"
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 12l6 6L20 6" />
      </svg>
    </span>
  );
}

interface Props {
  busy: string | null;
  onLog: (fields: FdcLogFields, note: string) => void;
  /** re-log a catalog/planned meal from recents */
  onLogDb: (mealId: string, note: string) => void;
  /** re-log a quick-add estimate from recents */
  onLogEstimate: (
    fields: { name: string; kcal: number; proteinG: number; carbsG: number; fatG: number },
    note: string,
  ) => void;
}

const input =
  "w-full rounded-2xl border border-[#dce3d7] bg-white px-3 py-2 text-sm text-[#2c3a2e] outline-none focus:border-[#8aa06f]";

/** USDA FoodData Central search with portion-aware logging. */
export function FoodSearch({ busy, onLog, onLogDb, onLogEstimate }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FdcFood[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const [correctedTo, setCorrectedTo] = useState<string | null>(null);
  const [selected, setSelected] = useState<FdcFood | null>(null);
  const [grams, setGrams] = useState(100);
  // Amount entry unit. Grams stay canonical internally; oz only changes what
  // the user types and reads, so macros and the server payload never drift.
  const [unit, setUnit] = useState<"g" | "oz">("g");
  const [note, setNote] = useState("");
  const [recents, setRecents] = useState<RecentFood[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Monotonic id per query: a slow, older fetch must never clobber the
  // results of a newer one (it read as "search didn't recognize the word").
  const searchSeq = useRef(0);

  // Touching blank space or scrolling the list drops the keyboard; the OS
  // animates it down on blur. Touches on any control are exempt: blurring on
  // touchstart shifts the iOS layout mid-tap and the tap gets swallowed, so
  // buttons must act, not dismiss. Desktop pointers never blur.
  const touchStartY = useRef<number | null>(null);
  const dismissKeyboard = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]?.clientY ?? null;
    const input = inputRef.current;
    if (!input || document.activeElement !== input) return;
    if ((e.target as HTMLElement).closest("button, a, input, [data-search-controls]")) return;
    input.blur();
  };

  // A drag is scroll intent: dismiss the keyboard even when it started on a
  // control, so the list is fully visible while scrolling.
  const dismissOnScroll = (e: React.TouchEvent) => {
    const input = inputRef.current;
    if (!input || document.activeElement !== input) return;
    const startY = touchStartY.current;
    const y = e.touches[0]?.clientY;
    if (startY === null || y === undefined) return;
    if (Math.abs(y - startY) > 12) input.blur();
  };

  const clearSearch = () => {
    setQuery("");
    setMessage("");
    // Refocus in the same tap so iOS reopens the keyboard for the next word.
    inputRef.current?.focus();
  };

  // The camera scanner only exists in the native shell; the button stays out
  // of the web build. State (not a render-time check) avoids hydration drift.
  const [canScan, setCanScan] = useState(false);
  useEffect(() => {
    setCanScan(Capacitor.isNativePlatform());
  }, []);

  const scanBarcode = async () => {
    try {
      const { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } = await import(
        "@capacitor/barcode-scanner"
      );
      const result = await CapacitorBarcodeScanner.scanBarcode({
        hint: CapacitorBarcodeScannerTypeHint.ALL,
        scanInstructions: "Point the camera at the barcode",
      });
      const code = result.ScanResult?.trim();
      // The digits flow through the normal search pipeline; the route
      // exact-matches the UPC and the effect below auto-opens the product.
      if (code) setQuery(code);
    } catch {
      // scanner dismissed or camera permission denied; nothing to log
    }
  };

  // Recently logged foods across every source (planned meals, catalog picks,
  // quick-add estimates, searched foods) for one-tap re-logging. Macros were
  // snapshotted at log time, so re-logging costs zero API calls. getSession
  // reads locally; getUser would add a network roundtrip that can silently
  // fail on a flaky mobile connection and leave the list empty.
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;
      const { data } = await supabase
        .from("meal_logs")
        .select("source, fdc_id, meal_id, name, kcal, protein_g, carbs_g, fat_g, verified")
        .eq("user_id", userId)
        .order("logged_at", { ascending: false })
        .limit(40);
      const seen = new Set<string>();
      const distinct: RecentFood[] = [];
      for (const row of data ?? []) {
        const key =
          row.source === "fdc" && row.fdc_id !== null
            ? `f${row.fdc_id}`
            : row.meal_id
              ? `m${row.meal_id}`
              : `n${row.name.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        distinct.push({
          key,
          source: row.source as RecentFood["source"],
          fdcId: row.fdc_id,
          mealId: row.meal_id,
          name: row.name,
          kcal: Number(row.kcal),
          proteinG: Number(row.protein_g),
          carbsG: Number(row.carbs_g),
          fatG: Number(row.fat_g),
          verified: row.verified === true,
        });
        if (distinct.length >= 8) break;
      }
      setRecents(distinct);
    })();
  }, []);

  // Route a recent food back through the matching log path with its
  // snapshotted macros; planned meals re-log as catalog picks.
  const relogRecent = (r: RecentFood) => {
    if (r.source === "fdc" && r.fdcId !== null) {
      onLog(
        {
          fdcId: r.fdcId,
          name: r.name.replace(/ \(\d+ g\)$/, ""),
          grams: Number(r.name.match(/\((\d+) g\)$/)?.[1] ?? 0) || 100,
          kcal: r.kcal,
          proteinG: r.proteinG,
          carbsG: r.carbsG,
          fatG: r.fatG,
          verified: r.verified,
        },
        "",
      );
    } else if (r.mealId) {
      onLogDb(r.mealId, "");
    } else {
      onLogEstimate(
        { name: r.name, kcal: r.kcal, proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG },
        "",
      );
    }
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    const id = ++searchSeq.current;
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      setMessage("");
      setCorrectedTo(null);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/food/search?q=${encodeURIComponent(q)}`);
        const data = (await res.json().catch(() => ({}))) as {
          foods?: FdcFood[];
          correctedTo?: string | null;
          error?: string;
        };
        if (id !== searchSeq.current) return; // a newer query owns the UI
        if (!res.ok) {
          setMessage(data.error ?? "Search failed. Try again.");
          setResults([]);
          setCorrectedTo(null);
        } else {
          setMessage(
            data.foods?.length
              ? ""
              : isBarcodeQuery(q)
                ? "That barcode isn't in the food database yet. Try searching by name."
                : "No matches. Try different words.",
          );
          setResults(data.foods ?? []);
          setCorrectedTo(data.foods?.length ? (data.correctedTo ?? null) : null);
          // A scan should land on the product, not a list: open the top match.
          if (isBarcodeQuery(q) && data.foods?.length) {
            const top = data.foods[0];
            setSelected(top);
            setGrams(Math.round(top.portions[0]?.gramWeight ?? 100));
          }
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
    const verified = isVerifiedSource(selected.dataType);
    const ozAmount = Math.round((grams / GRAMS_PER_OZ) * 10) / 10;
    return (
      <div>
        <button
          onClick={() => setSelected(null)}
          className="mb-2 text-xs text-[#829084] underline-offset-2 hover:underline"
        >
          Back to results
        </button>
        <p className="flex items-center gap-1.5 text-sm font-medium text-[#2c3a2e]">
          {selected.description}
          {verified && <VerifiedBadge />}
        </p>
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
        <div className="mt-2 flex items-end gap-2">
          <label className="block flex-1 text-xs text-[#829084]">
            Amount
            <input
              type="number"
              min={unit === "g" ? 1 : 0.1}
              max={unit === "g" ? 2000 : 70}
              step={unit === "g" ? 1 : 0.1}
              inputMode="decimal"
              className={`${input} mt-1`}
              value={unit === "g" ? grams : ozAmount}
              onChange={(e) => {
                const raw = Number(e.target.value) || 0;
                const g = unit === "g" ? raw : raw * GRAMS_PER_OZ;
                setGrams(Math.max(1, Math.min(2000, Math.round(g))));
              }}
            />
          </label>
          <div className="flex overflow-hidden rounded-2xl border border-[#dce3d7]" role="group" aria-label="Amount unit">
            {(["g", "oz"] as const).map((u) => (
              <button
                key={u}
                onClick={() => setUnit(u)}
                aria-pressed={unit === u}
                className={`press px-3 py-2 text-sm ${
                  unit === u ? "bg-[#2c3a2e] text-white" : "bg-white text-[#2c3a2e]"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

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
                verified,
                ...macros,
              },
              note,
            )
          }
          disabled={busy !== null || macros.kcal <= 0}
          className="press mt-3 w-full rounded-2xl bg-[#2c3a2e] px-5 py-3 font-medium text-white disabled:opacity-60"
        >
          {busy === "log-fdc"
            ? "Logging..."
            : unit === "g"
              ? `Log ${grams} g`
              : `Log ${ozAmount} oz`}
        </button>
      </div>
    );
  }

  return (
    <div onTouchStart={dismissKeyboard} onTouchMove={dismissOnScroll}>
      <div className="flex gap-2" data-search-controls>
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            type="text"
            className={`${input} pr-10`}
            placeholder="Search foods, e.g. greek yogurt"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
        {canScan && (
          <button
            onClick={scanBarcode}
            disabled={busy !== null}
            aria-label="Scan a barcode"
            className="press flex w-11 shrink-0 items-center justify-center self-stretch rounded-2xl border border-[#dce3d7] bg-white text-[#2c3a2e] hover:border-[#8aa06f] disabled:opacity-50"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 6v12M8 6v12M12 6v8M16 6v12M20 6v12" />
            </svg>
          </button>
        )}
      </div>
      {searching && <p className="mt-2 text-xs text-[#829084]">Searching...</p>}
      {message && !searching && <p className="mt-2 text-sm text-[#829084]">{message}</p>}
      {correctedTo && !searching && results.length > 0 && (
        <p className="mt-2 text-xs text-[#829084]">
          Showing results for &quot;{correctedTo}&quot;
        </p>
      )}

      {results.length === 0 && query.trim().length < 2 && recents.length > 0 && (
        <div className="mt-3">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-[#829084]">
            Recent foods
          </h3>
          <div className="space-y-2">
            {recents.map((r) => (
              <button
                key={r.key}
                onClick={() => relogRecent(r)}
                disabled={busy !== null}
                aria-label={`Quick add ${r.name}`}
                className="press flex w-full items-center gap-2 rounded-2xl border border-[#dce3d7] bg-white p-3 text-left hover:border-[#8aa06f] disabled:opacity-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-[#2c3a2e]">
                    <span className="truncate">{r.name}</span>
                    {r.verified && <VerifiedBadge />}
                    {r.source === "estimate" && (
                      <span className="shrink-0 rounded-full bg-[#fdf3d7] px-2 py-0.5 text-[10px] text-[#7a6420]">
                        estimate
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-[#5d6b5f]">
                    {Math.round(r.kcal)} kcal · P {Math.round(r.proteinG)}g
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#dce3d7] text-[#2c3a2e]"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
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
                <span className="flex items-center gap-1.5 text-sm font-medium text-[#2c3a2e]">
                  <span className="truncate">{f.description}</span>
                  {isVerifiedSource(f.dataType) && <VerifiedBadge />}
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
                      verified: isVerifiedSource(f.dataType),
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
