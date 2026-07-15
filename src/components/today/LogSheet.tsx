"use client";

import { useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";
import { FoodSearch, type FdcLogFields } from "./FoodSearch";
import { useSwipeToDismiss } from "./useSwipeToDismiss";

export interface SearchMeal {
  id: string;
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

interface EstimateFields {
  name: string;
  kcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  assumptions: string;
}

const EMPTY_FIELDS: EstimateFields = {
  name: "",
  kcal: "",
  proteinG: "",
  carbsG: "",
  fatG: "",
  assumptions: "",
};

interface Props {
  open: boolean;
  onClose: () => void;
  searchMeals: SearchMeal[];
  busy: string | null;
  /** which mode the sheet opens in; tracker users default to the food search */
  defaultMode?: "fdc" | "search" | "quick";
  onLogDb: (mealId: string, note: string) => void;
  onLogEstimate: (fields: { name: string; kcal: number; proteinG: number; carbsG: number; fatG: number }, note: string) => void;
  onLogFdc: (fields: FdcLogFields, note: string) => void;
}

/** Bottom sheet for logging something that wasn't on the plan. */
export function LogSheet({ open, onClose, searchMeals, busy, defaultMode = "fdc", onLogDb, onLogEstimate, onLogFdc }: Props) {
  const [mode, setMode] = useState<"fdc" | "search" | "quick">(defaultMode);

  // The sheet stays mounted while closed, so the initial state can capture a
  // stale default (day mode loads async). Re-sync on every open.
  useEffect(() => {
    if (open) setMode(defaultMode);
  }, [open, defaultMode]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [quickText, setQuickText] = useState("");
  const [fields, setFields] = useState<EstimateFields | null>(null);
  const [isEstimate, setIsEstimate] = useState(false);
  const [message, setMessage] = useState("");
  const [supportive, setSupportive] = useState<{ text: string } | null>(null);
  const [estimating, setEstimating] = useState(false);
  const { sheetRef, scrollRef, mounted, sheetStyle, backdropStyle, handlers } = useSwipeToDismiss(
    open,
    onClose,
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return searchMeals.slice(0, 6);
    return searchMeals.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, searchMeals]);

  const selected = searchMeals.find((m) => m.id === selectedId) ?? null;

  // Stay in the DOM through the exit transition; the hook unmounts us after.
  if (!mounted) return null;

  async function runEstimate() {
    if (!quickText.trim() || estimating) return;
    setEstimating(true);
    setMessage("");
    setSupportive(null);
    try {
      const res = await apiFetch("/api/log/estimate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: quickText.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        estimate?: { name: string; kcal: number; proteinG: number; carbsG: number; fatG: number; assumptions: string };
        supportive?: { text: string };
        error?: string;
        manual?: boolean;
      };
      if (data.supportive) {
        setSupportive(data.supportive);
      } else if (data.estimate) {
        setIsEstimate(true);
        setFields({
          name: data.estimate.name,
          kcal: String(data.estimate.kcal),
          proteinG: String(data.estimate.proteinG),
          carbsG: String(data.estimate.carbsG),
          fatG: String(data.estimate.fatG),
          assumptions: data.estimate.assumptions,
        });
      } else {
        setIsEstimate(false);
        setFields({ ...EMPTY_FIELDS, name: quickText.trim().slice(0, 120) });
        setMessage(data.error ?? "Enter the numbers yourself.");
      }
    } catch {
      setIsEstimate(false);
      setFields({ ...EMPTY_FIELDS, name: quickText.trim().slice(0, 120) });
      setMessage("Estimation is unavailable. Enter the numbers yourself.");
    } finally {
      setEstimating(false);
    }
  }

  function saveEstimate() {
    if (!fields) return;
    onLogEstimate(
      {
        name: fields.name.trim(),
        kcal: Number(fields.kcal),
        proteinG: Number(fields.proteinG) || 0,
        carbsG: Number(fields.carbsG) || 0,
        fatG: Number(fields.fatG) || 0,
      },
      note,
    );
  }

  const input =
    "w-full rounded-2xl border border-[#dce3d7] bg-white px-3 py-2 text-sm text-[#2c3a2e] outline-none focus:border-[#8aa06f]";

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      style={backdropStyle}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        className="flex h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-[#f4f6f2] shadow-[0_-8px_40px_rgba(22,32,26,0.18)]"
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
        {...handlers}
      >
        {/* Grab handle + header: dragging anywhere here dismisses, and its
            touch-action:none keeps the pull from fighting the content scroll. */}
        <div data-drag-handle className="shrink-0 px-5 pt-3" style={{ touchAction: "none" }}>
          <div
            className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#cdd6c8]"
            aria-hidden="true"
          />
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#2c3a2e]">Log something else</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="press -mr-1 flex h-9 w-9 items-center justify-center rounded-full text-[#829084] hover:bg-[#e6ebe0] hover:text-[#2c3a2e]"
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
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-5 pb-8"
          style={{ touchAction: "pan-y", overscrollBehavior: "contain" }}
        >
          {supportive ? (
            <p className="rounded-2xl bg-[#e9efdd] p-4 text-sm leading-6 text-[#3c4a3e]">{supportive.text}</p>
          ) : (
            <>
              <div className="mb-4 flex gap-2">
              {(["fdc", "search", "quick"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setMessage(""); }}
                  className={`press rounded-full border px-4 py-2 text-sm ${
                    mode === m
                      ? "border-[#2c3a2e] bg-[#2c3a2e] text-white"
                      : "border-[#dce3d7] bg-white text-[#2c3a2e]"
                  }`}
                >
                  {m === "fdc" ? "Search foods" : m === "search" ? "Meals" : "Quick add"}
                </button>
              ))}
            </div>

            {mode === "fdc" && <FoodSearch busy={busy} onLog={onLogFdc} />}

            {mode === "fdc" ? null : mode === "search" ? (
              <div>
                <input
                  type="text"
                  className={input}
                  placeholder="Search the meal database"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setSelectedId(null); }}
                />
                <div className="mt-3 space-y-2">
                  {results.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setSelectedId(m.id)}
                      className={`press w-full rounded-2xl border p-3 text-left ${
                        selectedId === m.id
                          ? "border-[#2c3a2e] bg-white"
                          : "border-[#dce3d7] bg-white hover:border-[#8aa06f]"
                      }`}
                    >
                      <span className="block text-sm font-medium text-[#2c3a2e]">{m.name}</span>
                      <span className="mt-1 block text-xs text-[#5d6b5f]">
                        {Math.round(m.kcal)} kcal · P {Math.round(m.proteinG)}g · C {Math.round(m.carbsG)}g · F {Math.round(m.fatG)}g
                      </span>
                    </button>
                  ))}
                  {results.length === 0 && (
                    <p className="text-sm text-[#829084]">No matches. Try Quick add instead.</p>
                  )}
                </div>
                {selected && (
                  <div className="mt-3">
                    <input
                      type="text"
                      className={input}
                      placeholder="Optional note (how it felt, mood, energy)"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <button
                      onClick={() => onLogDb(selected.id, note)}
                      disabled={busy !== null}
                      className="press mt-3 w-full rounded-2xl bg-[#2c3a2e] px-5 py-3 font-medium text-white disabled:opacity-60"
                    >
                      {busy === "log-db" ? "Logging..." : `Log ${selected.name}`}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                {!fields ? (
                  <>
                    <textarea
                      className={`${input} min-h-20`}
                      placeholder="Describe it, e.g. two slices of buttered toast"
                      maxLength={300}
                      value={quickText}
                      onChange={(e) => setQuickText(e.target.value)}
                    />
                    <button
                      onClick={runEstimate}
                      disabled={estimating || !quickText.trim()}
                      className="press mt-3 w-full rounded-2xl bg-[#2c3a2e] px-5 py-3 font-medium text-white disabled:opacity-60"
                    >
                      {estimating ? "Estimating..." : "Estimate macros"}
                    </button>
                  </>
                ) : (
                  <div className="space-y-2">
                    {isEstimate && (
                      <p className="rounded-xl bg-[#fdf3d7] px-3 py-2 text-xs text-[#7a6420]">
                        Estimate. Check the numbers before saving.
                        {fields.assumptions ? ` ${fields.assumptions}` : ""}
                      </p>
                    )}
                    {message && <p className="text-sm text-[#829084]">{message}</p>}
                    <input type="text" className={input} placeholder="Name" value={fields.name}
                      onChange={(e) => setFields({ ...fields, name: e.target.value })} />
                    <div className="grid grid-cols-4 gap-2">
                      {(["kcal", "proteinG", "carbsG", "fatG"] as const).map((k) => (
                        <label key={k} className="text-xs text-[#829084]">
                          {k === "kcal" ? "kcal" : k === "proteinG" ? "P (g)" : k === "carbsG" ? "C (g)" : "F (g)"}
                          <input
                            type="number" min="0" inputMode="numeric"
                            className={`${input} mt-1`}
                            value={fields[k]}
                            onChange={(e) => setFields({ ...fields, [k]: e.target.value })}
                          />
                        </label>
                      ))}
                    </div>
                    <input
                      type="text"
                      className={input}
                      placeholder="Optional note (how it felt, mood, energy)"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setFields(null); setMessage(""); }}
                        className="press rounded-2xl border border-[#dce3d7] bg-white px-4 py-3 text-sm text-[#2c3a2e]"
                      >
                        Back
                      </button>
                      <button
                        onClick={saveEstimate}
                        disabled={busy !== null || !fields.name.trim() || Number(fields.kcal) <= 0}
                        className="press flex-1 rounded-2xl bg-[#2c3a2e] px-5 py-3 font-medium text-white disabled:opacity-60"
                      >
                        {busy === "log-estimate" ? "Saving..." : "Save log"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
