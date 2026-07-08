"use client";

import { useEffect, useRef } from "react";

const ITEM_SIZE = 40; // px height (vertical) — width uses ITEM_WIDTH
const ITEM_WIDTH = 64;
const VISIBLE_ITEMS = 5;

interface WheelPickerProps {
  /** ordered values shown on the wheel */
  values: number[];
  /** currently selected value (must exist in values) */
  value: number;
  onChange: (value: number) => void;
  /** unit label rendered beside the wheel, e.g. "lbs"; empty to omit */
  label?: string;
  /** accessible name for the wheel */
  ariaLabel: string;
  /** scroll axis; vertical is the classic iOS drum, horizontal is a slider strip */
  orientation?: "vertical" | "horizontal";
  /** custom display for each value, e.g. 71 -> 5'11" */
  format?: (value: number) => string;
}

/**
 * Scroll-snap wheel. Every value that passes the center line "ticks": a short
 * vibration where the browser supports it (Android) and a visual snap
 * everywhere (iPhone browsers expose no vibration API to web pages).
 */
export function WheelPicker({
  values,
  value,
  onChange,
  label = "",
  ariaLabel,
  orientation = "vertical",
  format = (v) => String(v),
}: WheelPickerProps) {
  const horizontal = orientation === "horizontal";
  const step = horizontal ? ITEM_WIDTH : ITEM_SIZE;

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastIndex = useRef(values.indexOf(value));
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const readPos = (el: HTMLDivElement) => (horizontal ? el.scrollLeft : el.scrollTop);
  const writePos = (el: HTMLDivElement, pos: number, smooth = false) =>
    el.scrollTo(
      horizontal
        ? { left: pos, behavior: smooth ? "smooth" : "auto" }
        : { top: pos, behavior: smooth ? "smooth" : "auto" },
    );

  // Position the wheel on mount. The browser's initial scroll-snap pass can
  // override a single programmatic set, so re-apply across the first frames
  // until the position sticks.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = values.indexOf(value);
    if (idx < 0) return;
    lastIndex.current = idx;

    const target = idx * step;
    const apply = () => {
      if (Math.abs(readPos(el) - target) > 1) writePos(el, target);
    };
    apply();
    const raf = requestAnimationFrame(apply);
    const t1 = setTimeout(apply, 60);
    const t2 = setTimeout(apply, 180);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.min(values.length - 1, Math.max(0, Math.round(readPos(el) / step)));

    if (idx !== lastIndex.current) {
      lastIndex.current = idx;
      // Haptic tick where supported; harmless no-op elsewhere.
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(4);
      }
      onChange(values[idx]);
    }

    // After scrolling settles, snap-align exactly (covers momentum overshoot).
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const settled = Math.min(values.length - 1, Math.max(0, Math.round(readPos(el) / step)));
      writePos(el, settled * step, true);
    }, 120);
  }

  const pad = (VISIBLE_ITEMS - 1) / 2;

  const itemButtons = values.map((v) => {
    const selected = v === value;
    return (
      <button
        key={v}
        type="button"
        role="option"
        aria-selected={selected}
        onClick={() => {
          const el = scrollRef.current;
          el && writePos(el, values.indexOf(v) * step, true);
        }}
        className={`flex shrink-0 items-center justify-center transition-[transform,color,font-size] duration-100 ${
          selected ? "scale-110 text-2xl font-semibold text-[#2c3a2e]" : "text-lg text-[#9aa89c]"
        }`}
        style={horizontal ? { width: ITEM_WIDTH, height: 56 } : { height: ITEM_SIZE, width: 88 }}
      >
        {format(v)}
      </button>
    );
  });

  if (horizontal) {
    return (
      <div className="flex w-full flex-col items-center gap-1">
        <div className="relative w-full" style={{ maxWidth: ITEM_WIDTH * VISIBLE_ITEMS }}>
          {/* center selection band */}
          <div
            className="pointer-events-none absolute inset-y-0 left-1/2 z-10 -translate-x-1/2 rounded-xl border-x-2 border-[#8aa06f] bg-[#d3e29f]/20"
            style={{ width: ITEM_WIDTH }}
          />
          {/* fade edges */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-[#f4f6f2] to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-[#f4f6f2] to-transparent" />

          <div
            ref={scrollRef}
            role="listbox"
            aria-label={ariaLabel}
            aria-orientation="horizontal"
            tabIndex={0}
            onScroll={handleScroll}
            className="flex snap-x snap-mandatory overflow-x-auto overscroll-contain py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>button]:snap-center"
          >
            <div style={{ width: pad * ITEM_WIDTH }} className="shrink-0" aria-hidden />
            {itemButtons}
            <div style={{ width: pad * ITEM_WIDTH }} className="shrink-0" aria-hidden />
          </div>
        </div>
        {label && <span className="text-sm font-medium text-[#829084]">{label}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative" style={{ height: ITEM_SIZE * VISIBLE_ITEMS }}>
        {/* center selection band */}
        <div
          className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 rounded-xl border-y-2 border-[#8aa06f] bg-[#d3e29f]/20"
          style={{ height: ITEM_SIZE }}
        />
        {/* fade edges */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-12 bg-gradient-to-b from-[#f4f6f2] to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-12 bg-gradient-to-t from-[#f4f6f2] to-transparent" />

        <div
          ref={scrollRef}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={0}
          onScroll={handleScroll}
          className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>button]:snap-center"
        >
          <div style={{ height: pad * ITEM_SIZE }} aria-hidden />
          {itemButtons}
          <div style={{ height: pad * ITEM_SIZE }} aria-hidden />
        </div>
      </div>
      {label && <span className="text-sm font-medium text-[#829084]">{label}</span>}
    </div>
  );
}
