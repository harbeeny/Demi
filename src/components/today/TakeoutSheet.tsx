"use client";

import { useEffect, useRef, useState } from "react";

import { tapHaptic } from "@/lib/haptics";
import { TAKEOUT_PROVIDERS } from "@/lib/takeout/deeplinks";
import { hasPublishedNutrition } from "@/lib/takeout/macro-match";
import { recordAndOpenTakeout } from "@/lib/takeout/intent";
import { CHAINS } from "@/lib/takeout/chains";
import {
  hiddenSpots,
  rankGoToSpots,
  remainingLine,
  type GoToSpot,
} from "@/lib/takeout/recommend";
import { normalizeArea, regionLabel, type TakeoutRegion } from "@/lib/takeout/region";
import {
  markLocationUiState,
  readLocationUiState,
  requestCoarsePosition,
  type LocationUiState,
} from "@/lib/takeout/location";
import {
  loadTakeoutContext,
  savePickedChains,
  saveRegion,
  setChainAffinity,
  type TakeoutContext,
} from "@/lib/takeout/store";
import type { Goal, TakeoutSurface, TakeoutProvider } from "@/lib/supabase/types";
import type { MacroTotals } from "@/lib/log/remaining";
import { useSwipeToDismiss } from "./useSwipeToDismiss";
import type { TodayMeal } from "./MealCard";

interface Props {
  /** the meal being ordered; null closes the sheet */
  meal: TodayMeal | null;
  goal: Goal | null;
  surface: TakeoutSurface;
  /** remaining daily macros (target minus logged), the sizing context */
  remaining: MacroTotals;
  onClose: () => void;
}

/**
 * Takeout fake-door handoff sheet (6.5 + 6.5a). Demand measurement only:
 * taps are logged, the order happens entirely in the delivery app, and the
 * copy says so. The 6.5a layer adds, all inside this in-context surface and
 * never in onboarding: a soft location priming block (the OS dialog fires
 * ONLY from its accept button; "not now" stays ours, denied falls back to
 * a typed city/ZIP), a skippable cold-start go-to-spots picker, and
 * preference-ranked chain chips that retarget the same provider search.
 * Honesty gates hold: no published chain nutrition means the badge always
 * reads "macros estimated" (SAFETY.md), and ranking runs off the user's
 * own signals plus remaining macros for context, never claimed macro fit.
 */
export function TakeoutSheet({ meal, goal, surface, remaining, onClose }: Props) {
  const open = meal !== null;
  const { sheetRef, scrollRef, mounted, sheetStyle, backdropStyle, handlers } =
    useSwipeToDismiss(open, onClose);

  // Keep the last meal through the exit animation (RecipeSheet pattern).
  const lastMeal = useRef<TodayMeal | null>(null);
  if (meal) lastMeal.current = meal;
  const shown = meal ?? lastMeal.current;

  const [opening, setOpening] = useState<TakeoutProvider | null>(null);
  const [ctx, setCtx] = useState<TakeoutContext | null>(null);
  const [region, setRegion] = useState<TakeoutRegion | null>(null);
  const [locUi, setLocUi] = useState<LocationUiState>("unset");
  const [locBusy, setLocBusy] = useState(false);
  const [zipMode, setZipMode] = useState(false);
  const [areaInput, setAreaInput] = useState("");
  const [changingRegion, setChangingRegion] = useState(false);
  const [query, setQuery] = useState<{ kind: "dish" } | { kind: "chain"; label: string }>({
    kind: "dish",
  });
  const [editMode, setEditMode] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pickerBusy, setPickerBusy] = useState(false);

  // The sheet stays a working dish handoff even if none of this loads; the
  // preference and location layers appear as their data arrives.
  useEffect(() => {
    if (!open) return;
    setOpening(null);
    setQuery({ kind: "dish" });
    setEditMode(false);
    setZipMode(false);
    setChangingRegion(false);
    setPicked(new Set());
    setLocUi(readLocationUiState());
    void loadTakeoutContext().then((loaded) => {
      setCtx(loaded);
      setRegion(loaded.region);
    });
  }, [open]);

  if (!mounted || !shown) return null;

  const fits = hasPublishedNutrition({ name: shown.name, mealId: shown.mealId });
  const goTos = ctx ? rankGoToSpots(ctx.prefs, ctx.inferredCounts) : [];
  const hidden = ctx ? hiddenSpots(ctx.prefs) : [];
  const coldStart = ctx !== null && goTos.length === 0 && hidden.length === 0;
  const area = areaInput.length > 0 ? normalizeArea(areaInput) : null;

  const order = async (provider: TakeoutProvider) => {
    if (opening) return;
    tapHaptic();
    setOpening(provider);
    try {
      await recordAndOpenTakeout({
        provider,
        mealId: query.kind === "dish" ? shown.mealId : null,
        dishQuery: query.kind === "dish" ? shown.name : query.label,
        hadMacroMatch: fits,
        goal,
        surface,
        geo: region?.source === "gps" ? { lat: region.lat, lng: region.lng } : undefined,
      });
    } finally {
      setOpening(null);
      onClose();
    }
  };

  const requestLocation = async () => {
    tapHaptic();
    setLocBusy(true);
    try {
      const result = await requestCoarsePosition();
      if (result.ok) {
        const next: TakeoutRegion = { source: "gps", lat: result.lat, lng: result.lng };
        setRegion(next);
        setChangingRegion(false);
        setZipMode(false);
        markLocationUiState("unset");
        setLocUi("unset");
        void saveRegion(next);
      } else if (result.reason === "denied") {
        markLocationUiState("denied");
        setLocUi("denied");
        setZipMode(true);
      } else {
        setZipMode(true);
      }
    } finally {
      setLocBusy(false);
    }
  };

  const saveArea = () => {
    if (!area) return;
    tapHaptic();
    const next: TakeoutRegion = { source: "typed", area };
    setRegion(next);
    setZipMode(false);
    setChangingRegion(false);
    setAreaInput("");
    void saveRegion(next);
  };

  const savePicker = async () => {
    if (picked.size === 0 || pickerBusy) return;
    tapHaptic();
    setPickerBusy(true);
    try {
      const ids = [...picked];
      await savePickedChains(ids);
      setCtx((prev) =>
        prev
          ? {
              ...prev,
              prefs: [
                ...prev.prefs,
                ...ids.map((chain_name) => ({
                  chain_name,
                  affinity: "liked" as const,
                  source: "picker" as const,
                })),
              ],
            }
          : prev,
      );
    } finally {
      setPickerBusy(false);
    }
  };

  const toggleHide = (spot: GoToSpot, hide: boolean) => {
    tapHaptic();
    const source =
      spot.origin === "favorited" ? "favorited" : spot.origin === "picked" ? "picker" : "inferred";
    setCtx((prev) => {
      if (!prev) return prev;
      const rest = prev.prefs.filter((p) => p.chain_name !== spot.id);
      if (!hide && spot.origin === "inferred") {
        // restoring an inferred hide: drop the row, inference resurfaces it
        void setChainAffinity(spot.id, "clear");
        return { ...prev, prefs: rest };
      }
      const affinity = hide ? ("hidden" as const) : ("liked" as const);
      void setChainAffinity(spot.id, { affinity, source });
      return { ...prev, prefs: [...rest, { chain_name: spot.id, affinity, source }] };
    });
  };

  const toggleFavorite = (spot: GoToSpot) => {
    tapHaptic();
    const next =
      spot.origin === "favorited"
        ? { affinity: "liked" as const, source: "picker" as const }
        : { affinity: "liked" as const, source: "favorited" as const };
    setCtx((prev) => {
      if (!prev) return prev;
      void setChainAffinity(spot.id, next);
      return {
        ...prev,
        prefs: [
          ...prev.prefs.filter((p) => p.chain_name !== spot.id),
          { chain_name: spot.id, ...next },
        ],
      };
    });
  };

  const chip = (selected: boolean) =>
    `press rounded-full border px-3 py-2 text-xs ${
      selected
        ? "border-(--ink) bg-(--ink) text-(--ink-contrast)"
        : "border-(--border) bg-(--surface) text-(--ink) hover:border-(--accent)"
    }`;

  // Location states, in-context per 6.5a: stored region (quiet row) ->
  // OS-denied or fix-failed (typed fallback) -> soft-declined (quiet offer)
  // -> first run (priming block; the only path to the OS dialog).
  const locationBlock = () => {
    if (region && !changingRegion) {
      return (
        <button
          onClick={() => {
            tapHaptic();
            setChangingRegion(true);
          }}
          className="mt-3 flex w-full items-center justify-between rounded-2xl border border-dashed border-(--border) px-4 py-2.5 text-left text-xs text-(--muted) hover:border-(--accent) hover:text-(--ink)"
        >
          <span>📍 {regionLabel(region)}</span>
          <span className="underline-offset-2 hover:underline">Change</span>
        </button>
      );
    }
    if (locUi === "denied" || zipMode) {
      return (
        <div className="mt-3 rounded-2xl border border-(--border) bg-(--surface) p-3">
          <p className="text-xs leading-5 text-(--muted)">
            {locUi === "denied"
              ? "Location is off for Demi, so type where you usually order instead."
              : "Couldn't get a location fix; type where you usually order instead."}
          </p>
          <div className="mt-2 flex gap-2">
            <input
              value={areaInput}
              onChange={(e) => setAreaInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveArea();
              }}
              placeholder="City or ZIP"
              className="min-w-0 flex-1 rounded-xl border border-(--border-input) bg-(--field) px-3 py-2 text-base text-(--ink) placeholder:text-(--muted)"
            />
            <button
              onClick={saveArea}
              disabled={!area}
              className="press shrink-0 rounded-xl bg-(--ink) px-4 py-2 text-sm font-medium text-(--ink-contrast) disabled:opacity-50"
            >
              Save
            </button>
          </div>
          <button
            onClick={() => void requestLocation()}
            disabled={locBusy}
            className="mt-2 text-xs text-(--muted) underline-offset-2 hover:underline disabled:opacity-50"
          >
            {locBusy ? "Checking..." : "Try location again"}
          </button>
        </div>
      );
    }
    if (locUi === "later") {
      return (
        <button
          onClick={() => void requestLocation()}
          disabled={locBusy}
          className="mt-3 flex w-full items-center rounded-2xl border border-dashed border-(--border) px-4 py-2.5 text-left text-xs text-(--muted) hover:border-(--accent) hover:text-(--ink) disabled:opacity-50"
        >
          📍 {locBusy ? "Checking..." : "Add location for nearby results"}
        </button>
      );
    }
    return (
      <div className="mt-3 rounded-2xl bg-(--tint) p-4">
        <p className="text-sm font-medium text-(--tint-ink)">Find on-plan food near you</p>
        <p className="mt-1 text-xs leading-5 text-(--tint-ink)">
          Demi uses your location once per search to aim delivery results near you. Only a
          rough area is kept, never a trail, and it stays out of your logs.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => void requestLocation()}
            disabled={locBusy}
            className="press rounded-xl bg-(--ink) px-4 py-2 text-sm font-medium text-(--ink-contrast) disabled:opacity-60"
          >
            {locBusy ? "Checking..." : "Use my location"}
          </button>
          <button
            onClick={() => {
              tapHaptic();
              markLocationUiState("later");
              setLocUi("later");
            }}
            disabled={locBusy}
            className="press rounded-xl border border-(--border) bg-(--surface) px-4 py-2 text-sm text-(--ink) disabled:opacity-50"
          >
            Not now
          </button>
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      style={backdropStyle}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-(--bg) shadow-[var(--shadow-sheet)]"
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
        {...handlers}
      >
        <div data-drag-handle className="shrink-0 px-5 pt-3" style={{ touchAction: "none" }}>
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-(--handle)" aria-hidden="true" />
          <div className="mb-1 flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold leading-snug text-(--ink)">Order this meal</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="press -mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-(--muted) hover:bg-(--track) hover:text-(--ink)"
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
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-(--ink)">
            <span>{shown.name}</span>
            {fits ? (
              <span className="shrink-0 rounded-full bg-(--tint) px-2 py-0.5 text-[10px] text-(--tint-ink)">
                ≈ fits your macros
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-(--warn-bg) px-2 py-0.5 text-[10px] text-(--warn-ink)">
                macros estimated
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-(--muted)">{remainingLine(remaining)}</p>
          <p className="mt-2 text-xs leading-5 text-(--muted)">
            Demi opens the delivery app&apos;s search, and the order happens there. Restaurant
            versions vary, so treat the macros as estimates.
          </p>

          {locationBlock()}

          {goTos.length > 0 && (
            <section className="mt-4">
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-xs font-medium uppercase tracking-wide text-(--muted)">
                  Search for
                </h3>
                <button
                  onClick={() => {
                    tapHaptic();
                    setEditMode((v) => !v);
                  }}
                  className="text-xs text-(--muted) underline-offset-2 hover:underline"
                >
                  {editMode ? "Done" : "Edit spots"}
                </button>
              </div>
              {!editMode ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setQuery({ kind: "dish" })}
                    aria-pressed={query.kind === "dish"}
                    className={chip(query.kind === "dish")}
                  >
                    This dish
                  </button>
                  {goTos.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setQuery({ kind: "chain", label: s.label })}
                      aria-pressed={query.kind === "chain" && query.label === s.label}
                      className={chip(query.kind === "chain" && query.label === s.label)}
                    >
                      {s.origin === "favorited" ? "★ " : ""}
                      {s.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {goTos.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded-2xl bg-(--surface) px-3 py-2 shadow-sm"
                    >
                      <span className="text-sm text-(--ink)">{s.label}</span>
                      <span className="flex items-center gap-3 text-xs">
                        <button
                          onClick={() => toggleFavorite(s)}
                          aria-pressed={s.origin === "favorited"}
                          className={`press ${s.origin === "favorited" ? "text-(--ink)" : "text-(--muted)"}`}
                        >
                          {s.origin === "favorited" ? "★ Favorited" : "☆ Favorite"}
                        </button>
                        <button
                          onClick={() => toggleHide(s, true)}
                          className="press text-(--muted) underline-offset-2 hover:underline"
                        >
                          Hide
                        </button>
                      </span>
                    </div>
                  ))}
                  {hidden.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded-2xl border border-dashed border-(--border) px-3 py-2"
                    >
                      <span className="text-sm text-(--muted)">{s.label} · hidden</span>
                      <button
                        onClick={() => toggleHide(s, false)}
                        className="press text-xs text-(--muted) underline-offset-2 hover:underline"
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <div className="mt-4 space-y-2">
            {TAKEOUT_PROVIDERS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => void order(id)}
                disabled={opening !== null}
                className="press flex w-full items-center justify-between rounded-2xl border border-(--border) bg-(--surface) px-4 py-3 text-sm font-medium text-(--ink) hover:border-(--accent) disabled:opacity-50"
              >
                <span className="min-w-0 truncate pr-3">
                  {opening === id
                    ? `Opening ${label}...`
                    : query.kind === "dish"
                      ? `Open ${label}`
                      : `${query.label} on ${label}`}
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="shrink-0 text-(--muted)"
                >
                  <path d="M7 7h10v10" />
                  <path d="M7 17 17 7" />
                </svg>
              </button>
            ))}
          </div>

          {coldStart && (
            <section className="mt-5">
              <h3 className="text-xs font-medium uppercase tracking-wide text-(--muted)">
                Pick your go-to spots 🍔
              </h3>
              <p className="mt-1 text-xs leading-5 text-(--muted)">
                Optional. Choose places you actually order from and Demi keeps them one tap
                away here; skip it and Demi learns from what you log instead.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {CHAINS.map((c) => {
                  const selected = picked.has(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        setPicked((prev) => {
                          const next = new Set(prev);
                          if (next.has(c.id)) next.delete(c.id);
                          else next.add(c.id);
                          return next;
                        });
                      }}
                      aria-pressed={selected}
                      className={chip(selected)}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
              {picked.size > 0 && (
                <button
                  onClick={() => void savePicker()}
                  disabled={pickerBusy}
                  className="press mt-3 w-full rounded-2xl bg-(--ink) px-4 py-2.5 text-sm font-medium text-(--ink-contrast) disabled:opacity-60"
                >
                  {pickerBusy
                    ? "Saving..."
                    : `Save ${picked.size} ${picked.size === 1 ? "spot" : "spots"}`}
                </button>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
