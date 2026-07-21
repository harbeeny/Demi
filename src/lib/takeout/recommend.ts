import type { MacroTotals } from "@/lib/log/remaining";
import { CHAIN_BY_ID } from "./chains";

/**
 * Go-to-spot ranking for the takeout sheet. Honesty boundary, on purpose:
 * ranking runs off the user's own signals (favorites, picks, inferred
 * history frequency), never off claimed macro fit; ranking chains BY macros
 * would require published per-item nutrition we don't have yet
 * (macro-match.ts is that gate). Remaining macros provide the sizing
 * context line instead, and HealthKit "burned today" layering is Phase 7.
 */

export interface TakeoutPrefRow {
  chain_name: string;
  affinity: "liked" | "hidden";
  source: "picker" | "inferred" | "favorited";
}

export interface GoToSpot {
  id: string;
  label: string;
  origin: "favorited" | "picked" | "inferred";
}

export function rankGoToSpots(
  prefs: TakeoutPrefRow[],
  inferredCounts: Record<string, number>,
  max = 6,
): GoToSpot[] {
  const hidden = new Set(prefs.filter((p) => p.affinity === "hidden").map((p) => p.chain_name));
  const favorited = prefs.filter((p) => p.affinity === "liked" && p.source === "favorited");
  const picked = prefs.filter((p) => p.affinity === "liked" && p.source !== "favorited");

  const out: GoToSpot[] = [];
  const seen = new Set<string>();
  const push = (id: string, origin: GoToSpot["origin"]) => {
    const chain = CHAIN_BY_ID.get(id);
    if (!chain || seen.has(id) || hidden.has(id)) return;
    seen.add(id);
    out.push({ id, label: chain.label, origin });
  };

  for (const p of favorited) push(p.chain_name, "favorited");
  for (const p of picked) push(p.chain_name, "picked");
  for (const [id] of Object.entries(inferredCounts).sort((a, b) => b[1] - a[1])) {
    push(id, "inferred");
  }
  return out.slice(0, max);
}

/** Chains the user hid, for the edit view's restore list. */
export function hiddenSpots(prefs: TakeoutPrefRow[]): GoToSpot[] {
  return prefs
    .filter((p) => p.affinity === "hidden")
    .flatMap((p) => {
      const chain = CHAIN_BY_ID.get(p.chain_name);
      return chain ? [{ id: chain.id, label: chain.label, origin: "picked" as const }] : [];
    });
}

/**
 * The sizing context line: plain numbers from remaining daily macros
 * (target minus logged), the same math the hero shows. Neutral when past
 * target, mirroring the Today screen's phrasing; the sheet never blocks or
 * scolds (SAFETY.md: no restriction framing).
 */
export function remainingLine(remaining: MacroTotals): string {
  const kcal = Math.round(remaining.kcal);
  const protein = Math.round(remaining.proteinG);
  if (kcal >= 0) {
    return `≈ ${kcal} kcal · ${Math.max(0, protein)}g protein left today`;
  }
  return `≈ ${-kcal} kcal past today's target`;
}
