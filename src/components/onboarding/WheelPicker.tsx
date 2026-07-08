"use client";

import { useEffect, useRef } from "react";

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

interface WheelPickerProps {
  /** ordered values shown on the wheel */
  values: number[];
  /** currently selected value (must exist in values) */
  value: number;
  onChange: (value: number) => void;
  /** unit label rendered beside the wheel, e.g. "lbs", "ft" */
  label: string;
  /** accessible name for the wheel */
  ariaLabel: string;
}

/**
 * iOS-style scroll wheel with scroll-snap. Every number that passes the
 * center line "ticks": a short vibration where the browser supports it
 * (Android) and a visual snap everywhere (iPhone browsers expose no
 * vibration API to web pages).
 */
export function WheelPicker({ values, value, onChange, label, ariaLabel }: WheelPickerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastIndex = useRef(values.indexOf(value));
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Position the wheel on mount and when the value changes externally.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = values.indexOf(value);
    if (idx >= 0 && Math.round(el.scrollTop / ITEM_HEIGHT) !== idx) {
      el.scrollTop = idx * ITEM_HEIGHT;
      lastIndex.current = idx;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.min(values.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM_HEIGHT)));

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
      const settled = Math.min(
        values.length - 1,
        Math.max(0, Math.round(el.scrollTop / ITEM_HEIGHT)),
      );
      el.scrollTo({ top: settled * ITEM_HEIGHT, behavior: "smooth" });
    }, 120);
  }

  const pad = (VISIBLE_ITEMS - 1) / 2;

  return (
    <div className="flex items-center gap-2">
      <div className="relative" style={{ height: WHEEL_HEIGHT }}>
        {/* center selection band */}
        <div
          className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 rounded-xl border-y-2 border-[#8aa06f] bg-[#d3e29f]/20"
          style={{ height: ITEM_HEIGHT }}
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
          className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div style={{ height: pad * ITEM_HEIGHT }} aria-hidden />
          {values.map((v) => {
            const selected = v === value;
            return (
              <button
                key={v}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  const el = scrollRef.current;
                  const idx = values.indexOf(v);
                  el?.scrollTo({ top: idx * ITEM_HEIGHT, behavior: "smooth" });
                }}
                className={`flex w-16 snap-center items-center justify-center transition-all duration-100 ${
                  selected
                    ? "scale-110 text-2xl font-semibold text-[#2c3a2e]"
                    : "text-lg text-[#9aa89c]"
                }`}
                style={{ height: ITEM_HEIGHT }}
              >
                {v}
              </button>
            );
          })}
          <div style={{ height: pad * ITEM_HEIGHT }} aria-hidden />
        </div>
      </div>
      <span className="text-sm font-medium text-[#829084]">{label}</span>
    </div>
  );
}
