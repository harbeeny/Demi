/**
 * Chain catalog for the takeout fake-door's preference layer. Slugs are the
 * stable keys persisted in user_takeout_prefs.chain_name (DB check bounds
 * them to slug charset); labels render in the UI; aliases feed history
 * inference. This list only shapes suggestions and search queries, it makes
 * no nutrition claims (see macro-match.ts for that gate).
 */
export interface Chain {
  id: string;
  label: string;
  /** lowercase match terms; matched on word boundaries against log names */
  aliases: string[];
}

export const CHAINS: Chain[] = [
  { id: "chipotle", label: "Chipotle", aliases: ["chipotle"] },
  { id: "chick_fil_a", label: "Chick-fil-A", aliases: ["chick-fil-a", "chick fil a", "chickfila"] },
  { id: "canes", label: "Raising Cane's", aliases: ["raising cane", "cane's", "canes"] },
  { id: "cava", label: "CAVA", aliases: ["cava"] },
  { id: "sweetgreen", label: "Sweetgreen", aliases: ["sweetgreen"] },
  { id: "dig", label: "DIG", aliases: ["dig inn", "dig"] },
  { id: "naya", label: "NAYA", aliases: ["naya"] },
  { id: "panera", label: "Panera", aliases: ["panera"] },
  { id: "subway", label: "Subway", aliases: ["subway"] },
  { id: "mcdonalds", label: "McDonald's", aliases: ["mcdonald's", "mcdonalds"] },
  { id: "five_guys", label: "Five Guys", aliases: ["five guys"] },
  { id: "shake_shack", label: "Shake Shack", aliases: ["shake shack"] },
  { id: "wingstop", label: "Wingstop", aliases: ["wingstop"] },
  { id: "taco_bell", label: "Taco Bell", aliases: ["taco bell"] },
  { id: "panda_express", label: "Panda Express", aliases: ["panda express"] },
  { id: "kfc", label: "KFC", aliases: ["kfc"] },
  { id: "wendys", label: "Wendy's", aliases: ["wendy's", "wendys"] },
  { id: "burger_king", label: "Burger King", aliases: ["burger king"] },
  { id: "dominos", label: "Domino's", aliases: ["domino's", "dominos"] },
  { id: "jersey_mikes", label: "Jersey Mike's", aliases: ["jersey mike's", "jersey mikes"] },
  { id: "qdoba", label: "Qdoba", aliases: ["qdoba"] },
  { id: "starbucks", label: "Starbucks", aliases: ["starbucks"] },
];

export const CHAIN_BY_ID = new Map(CHAINS.map((c) => [c.id, c]));

const MATCHERS = CHAINS.map((chain) => ({
  id: chain.id,
  // \b keeps "cava" from matching "cavatappi"; aliases with spaces or
  // hyphens still match because \b anchors on the outer word edges.
  patterns: chain.aliases.map(
    (a) => new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
  ),
}));

/**
 * Count chain mentions across free-text food names (meal logs, past takeout
 * searches). "Learn first, ask second": history the user already gave us
 * outranks a questionnaire. Each string credits a chain at most once.
 */
export function inferChainCounts(names: Iterable<string>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const raw of names) {
    if (typeof raw !== "string" || raw.length === 0 || raw.length > 300) continue;
    for (const { id, patterns } of MATCHERS) {
      if (patterns.some((p) => p.test(raw))) {
        counts[id] = (counts[id] ?? 0) + 1;
      }
    }
  }
  return counts;
}
