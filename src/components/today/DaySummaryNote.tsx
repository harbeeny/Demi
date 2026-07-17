"use client";

import { useState } from "react";

import { tapHaptic } from "@/lib/haptics";

const STORAGE_KEY = "demi:daySummary:collapsed";

/**
 * The plan's one-paragraph rationale, collapsible so it stops crowding the
 * day once read. Disclosure rather than an X: the note regenerates every
 * day, so dismissal would either nag each morning or hide it forever.
 * The last choice persists across days.
 */
export function DaySummaryNote({ text }: { text: string }) {
  // TodayView mounts client-side only (behind the page's loading gate), so
  // reading storage in the initializer cannot mismatch prerendered HTML.
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "1";
    } catch {
      return true;
    }
  });

  const toggle = () => {
    tapHaptic();
    setExpanded((prev) => {
      try {
        localStorage.setItem(STORAGE_KEY, prev ? "1" : "0");
      } catch {
        // storage unavailable: the toggle still works for this visit
      }
      return !prev;
    });
  };

  return (
    <div className="my-5 rounded-3xl bg-(--tint)">
      <button
        onClick={toggle}
        aria-expanded={expanded}
        className="press flex w-full items-center justify-between rounded-3xl px-4 py-3 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-(--tint-muted)">
          Why this plan
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--tint-muted)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`transition-transform duration-300 ease-out motion-reduce:transition-none ${
            expanded ? "rotate-180" : ""
          }`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {/* 0fr -> 1fr grid row: the only pure-CSS way to transition to auto
          height. Retargets mid-flight, so rapid taps stay smooth. */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div
          className="overflow-hidden transition-opacity duration-200 motion-reduce:transition-none"
          style={{ opacity: expanded ? 1 : 0 }}
        >
          <p className="px-4 pb-4 text-sm leading-6 text-(--tint-ink)">{text}</p>
        </div>
      </div>
    </div>
  );
}
