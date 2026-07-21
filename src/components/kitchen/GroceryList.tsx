"use client";

import { useEffect, useState } from "react";

import type { CoveredLine, GroceryLine, GrocerySection } from "@/lib/plan/grocery";

/** Checked-off lines live in localStorage keyed by the list's content hash:
 *  replanning changes the hash and stale checks fall away naturally. */
function readChecked(storageKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    // storage unavailable: checks just don't persist
    return new Set();
  }
}

function useCheckedItems(storageKey: string) {
  // Lazy read so the first paint already shows the check-offs (an
  // effect-sync flashed them unchecked once tabs began painting instantly);
  // the keyed effect handles the list re-hashing after a replan.
  const [checked, setChecked] = useState<Set<string>>(() => readChecked(storageKey));

  useEffect(() => {
    setChecked(readChecked(storageKey));
    try {
      // prune shopping lists older than two weeks
      const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
      for (const key of Object.keys(localStorage)) {
        const m = key.match(/^demi:grocery:[a-z]+:(\d{4}-\d{2}-\d{2})/);
        if (m && Date.parse(m[1]) < cutoff) localStorage.removeItem(key);
      }
    } catch {
      // storage unavailable: nothing to prune
    }
  }, [storageKey]);

  const toggle = (line: string): boolean => {
    const nowChecked = !checked.has(line);
    setChecked((prev) => {
      const next = new Set(prev);
      if (nowChecked) next.add(line);
      else next.delete(line);
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
    return nowChecked;
  };

  return { checked, toggle };
}

interface Props {
  sections: GrocerySection[];
  /** lines the pantry already covers; rendered as "In your kitchen" */
  covered: CoveredLine[];
  storageKey: string;
  /** fires after a check state flips so the pantry can record the purchase */
  onToggleLine: (line: GroceryLine, nowChecked: boolean) => void;
  /** "I'm out": puts the item back on the buy list */
  onOutOf: (line: CoveredLine) => void;
}

export function GroceryList({ sections, covered, storageKey, onToggleLine, onOutOf }: Props) {
  const { checked, toggle } = useCheckedItems(storageKey);

  if (sections.length === 0 && covered.length === 0) {
    return <p className="text-sm text-(--muted)">Plan some meals and the list builds itself.</p>;
  }

  return (
    <div className="space-y-4">
      {sections.length === 0 && (
        <p className="text-sm text-(--muted)">Everything this week is already in your kitchen.</p>
      )}
      {sections.map((section) => (
        <div key={section.aisle}>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-(--muted)">
            {section.aisle}
          </h3>
          <ul className="space-y-1.5">
            {section.lines.map((line) => {
              const key = `${line.item}|${line.unit}`;
              const done = checked.has(key);
              return (
                <li key={key}>
                  <button
                    onClick={() => {
                      const nowChecked = toggle(key);
                      onToggleLine(line, nowChecked);
                    }}
                    aria-pressed={done}
                    className="press flex w-full items-center gap-3 rounded-2xl bg-(--surface) px-4 py-2.5 text-left shadow-sm"
                  >
                    <span
                      aria-hidden
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-xs ${
                        done ? "border-(--accent-strong) bg-(--accent-tint) text-(--ink)" : "border-(--border)"
                      }`}
                    >
                      {done ? "✓" : ""}
                    </span>
                    <span
                      className={`flex-1 text-sm ${
                        done ? "text-(--muted) line-through" : "text-(--ink)"
                      }`}
                    >
                      {line.item}
                    </span>
                    <span className="shrink-0 text-xs text-(--ink-2)">{line.display}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {covered.length > 0 && (
        <div className={sections.length > 0 ? "border-t border-(--border) pt-4" : undefined}>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-(--muted)">
            In your kitchen
          </h3>
          <p className="mb-2 text-xs text-(--muted)">
            Already covered. Tap anything you have run out of.
          </p>
          <ul className="space-y-1.5">
            {covered.map((line) => {
              const key = `${line.item}|${line.unit}`;
              return (
                <li key={key}>
                  <button
                    onClick={() => onOutOf(line)}
                    aria-label={`${line.item}, about ${line.display} at home. Tap if you are out.`}
                    className="press flex w-full items-center gap-3 rounded-2xl bg-(--surface-2) px-4 py-2.5 text-left"
                  >
                    <span
                      aria-hidden
                      className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-(--accent-tint) text-xs text-(--ink)"
                    >
                      ✓
                    </span>
                    <span className="flex-1 text-sm text-(--ink-2)">{line.item}</span>
                    <span className="shrink-0 text-xs text-(--muted)">{line.display}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
