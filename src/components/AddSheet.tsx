"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

import { useSwipeToDismiss } from "@/components/today/useSwipeToDismiss";

export type AddAction = "log" | "scan" | "kitchen";

interface Props {
  open: boolean;
  onClose: () => void;
  onAction: (action: AddAction) => void;
}

interface Row {
  action: AddAction;
  title: string;
  blurb: string;
  icon: React.ReactNode;
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const ICONS: Record<AddAction, React.ReactNode> = {
  log: (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20.5 20.5 16 16" />
    </svg>
  ),
  scan: (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8" />
      <path d="M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8" />
      <path d="M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16" />
      <path d="M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
      <path d="M7 12h10" />
    </svg>
  ),
  kitchen: (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="2" />
      <rect x="13" y="4" width="7" height="7" rx="2" />
      <rect x="4" y="13" width="7" height="7" rx="2" />
      <rect x="13" y="13" width="7" height="7" rx="2" />
    </svg>
  ),
};

/**
 * The + action sheet: a floating card of big descriptive rows (icon, title,
 * one-line blurb) in the house sheet physics. Rows are features, not
 * navigation; the tab bar decides what each action does.
 */
export function AddSheet({ open, onClose, onAction }: Props) {
  const { sheetRef, scrollRef, mounted, sheetStyle, backdropStyle, handlers } =
    useSwipeToDismiss(open, onClose);

  // The camera scanner only exists in the native shell; on the web the row
  // would open a sheet with no scanner, so it stays out of the list.
  const [canScan, setCanScan] = useState(false);
  useEffect(() => {
    setCanScan(Capacitor.isNativePlatform());
  }, []);

  if (!mounted) return null;

  const rows: Row[] = [
    {
      action: "log",
      title: "Log a food",
      blurb: "Search the food database or add a quick estimate.",
      icon: ICONS.log,
    },
    ...(canScan
      ? [
          {
            action: "scan" as const,
            title: "Scan a barcode",
            blurb: "Point the camera at a package to log it.",
            icon: ICONS.scan,
          },
        ]
      : []),
    {
      action: "kitchen",
      title: "Kitchen",
      blurb: "Plan your week and build the grocery list.",
      icon: ICONS.kitchen,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      style={backdropStyle}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Add"
        className="mx-3 mb-[calc(env(safe-area-inset-bottom)+0.75rem)] w-full max-w-md rounded-[1.75rem] bg-(--surface) p-2.5 shadow-[var(--shadow-sheet)]"
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
        {...handlers}
      >
        {/* The whole card drags: content never scrolls, so the pull can't
            fight anything, and the 6px start threshold keeps taps clean. */}
        <div data-drag-handle style={{ touchAction: "none" }}>
          <div className="mx-auto mb-2 mt-1 h-1.5 w-10 rounded-full bg-(--handle)" aria-hidden="true" />
          <div ref={scrollRef} className="space-y-2">
            {rows.map((row) => (
              <button
                key={row.action}
                onClick={() => onAction(row.action)}
                className="press flex w-full items-center gap-4 rounded-[1.25rem] bg-(--surface-2) px-4 py-4 text-left"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-(--accent-tint) text-(--ink)">
                  {row.icon}
                </span>
                <span className="flex-1">
                  <span className="block text-base font-semibold text-(--ink)">{row.title}</span>
                  <span className="mt-0.5 block text-sm leading-5 text-(--muted)">{row.blurb}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
