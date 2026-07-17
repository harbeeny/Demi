"use client";

import { useEffect, useState } from "react";

import type { GrocerySection } from "@/lib/plan/grocery";

/** Checked-off lines live in localStorage keyed by the list's content hash:
 *  replanning changes the hash and stale checks fall away naturally. */
function useCheckedItems(storageKey: string) {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setChecked(new Set(raw ? (JSON.parse(raw) as string[]) : []));
      // prune shopping lists older than two weeks
      const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
      for (const key of Object.keys(localStorage)) {
        const m = key.match(/^demi:grocery:[a-z]+:(\d{4}-\d{2}-\d{2})/);
        if (m && Date.parse(m[1]) < cutoff) localStorage.removeItem(key);
      }
    } catch {
      // storage unavailable: checks just don't persist
    }
  }, [storageKey]);

  const toggle = (line: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  };

  return { checked, toggle };
}

interface Props {
  sections: GrocerySection[];
  storageKey: string;
}

export function GroceryList({ sections, storageKey }: Props) {
  const { checked, toggle } = useCheckedItems(storageKey);

  if (sections.length === 0) {
    return <p className="text-sm text-(--muted)">Plan some meals and the list builds itself.</p>;
  }

  return (
    <div className="space-y-4">
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
                    onClick={() => toggle(key)}
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
    </div>
  );
}
