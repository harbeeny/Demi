// Zero-result rescue for food search. The USDA API has no fuzzy matching, so
// when a query comes back empty we try cheap deterministic variants: a
// plural/singular flip, then per-word spell correction against a small
// dictionary of common food vocabulary. Pure and client-safe.

// Lowercase canonical food words. Both singular and plural forms appear where
// both are commonly typed; correction never fires for words already here.
const FOOD_WORDS = [
  // proteins
  "egg", "eggs", "chicken", "breast", "thigh", "wings", "beef", "steak", "ground",
  "pork", "bacon", "ham", "turkey", "salmon", "tuna", "shrimp", "tilapia", "cod",
  "tofu", "tempeh", "sausage", "meatball", "meatballs", "jerky", "nuggets",
  // dairy
  "milk", "yogurt", "cheese", "cheddar", "mozzarella", "parmesan", "feta",
  "butter", "cream", "cottage", "whey",
  // grains and starches
  "rice", "pasta", "spaghetti", "macaroni", "noodles", "ramen", "bread", "toast",
  "oats", "oatmeal", "cereal", "granola", "quinoa", "tortilla", "bagel", "bun",
  "biscuit", "cracker", "crackers", "pancake", "pancakes", "waffle", "muffin",
  "croissant", "pretzel", "couscous",
  // fruits
  "apple", "banana", "orange", "grape", "grapes", "berry", "berries",
  "strawberry", "strawberries", "blueberry", "blueberries", "raspberry",
  "mango", "avocado", "peach", "pear", "watermelon", "pineapple", "melon",
  "cherry", "cherries", "kiwi", "plum", "raisin", "raisins", "coconut",
  "lemon", "lime", "grapefruit", "apricot", "date", "dates", "fig",
  // vegetables
  "broccoli", "spinach", "carrot", "carrots", "potato", "potatoes", "sweet",
  "tomato", "tomatoes", "onion", "onions", "pepper", "peppers", "cucumber",
  "lettuce", "corn", "beans", "peas", "kale", "mushroom", "mushrooms",
  "zucchini", "cauliflower", "celery", "garlic", "cabbage", "squash",
  "asparagus", "beet", "beets", "radish", "arugula", "edamame",
  // nuts, seeds, spreads
  "peanut", "peanuts", "almond", "almonds", "walnut", "walnuts", "cashew",
  "cashews", "pistachio", "pecan", "hummus", "tahini", "nutella",
  // meals and prepared
  "pizza", "burger", "sandwich", "salad", "soup", "taco", "tacos", "burrito",
  "sushi", "curry", "stew", "chili", "lasagna", "casserole", "omelet",
  "quesadilla", "fajita", "gyro", "kebab", "dumpling", "dumplings", "fries",
  "hotdog", "wrap", "bowl",
  // snacks and sweets
  "chocolate", "cookie", "cookies", "chips", "popcorn", "candy", "brownie",
  "cake", "pie", "pudding", "custard", "donut", "cupcake", "fudge", "caramel",
  "vanilla", "cinnamon", "gelato", "sorbet", "smoothie", "shake", "protein",
  "bar", "trail", "mix",
  // drinks and condiments
  "coffee", "juice", "soda", "water", "tea", "latte", "espresso", "beer",
  "wine", "kombucha", "sauce", "dressing", "honey", "sugar", "salt", "oil",
  "olive", "salsa", "ketchup", "mustard", "mayo", "mayonnaise", "syrup",
  "vinegar", "gravy", "ranch", "pesto", "guacamole",
] as const;

const DICTIONARY = new Set<string>(FOOD_WORDS);

/** Classic Levenshtein distance; inputs are short single words. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[n];
}

/**
 * Best dictionary correction for one word, or null when the word is fine
 * (already food vocabulary), too short to judge, or not close to anything.
 * Tolerance: 1 edit for 4-5 letter words, 2 edits for longer ones.
 */
export function correctWord(word: string): string | null {
  const w = word.toLowerCase();
  if (w.length < 4 || DICTIONARY.has(w) || !/^[a-z]+$/.test(w)) return null;
  const maxDistance = w.length >= 6 ? 2 : 1;
  let best: string | null = null;
  let bestDistance = maxDistance + 1;
  for (const candidate of DICTIONARY) {
    if (Math.abs(candidate.length - w.length) > maxDistance) continue;
    const d = editDistance(w, candidate);
    if (d < bestDistance) {
      bestDistance = d;
      best = candidate;
      if (d === 1) break; // a 1-edit hit is as good as it gets for a typo
    }
  }
  return bestDistance <= maxDistance ? best : null;
}

/**
 * Spell-correct a whole query against the food dictionary. Returns the
 * corrected phrase when at least one word changed, else null.
 */
export function correctQuery(query: string): string | null {
  let changed = false;
  const corrected = query
    .split(/\s+/)
    .map((word) => {
      const fix = correctWord(word);
      if (fix && fix !== word.toLowerCase()) {
        changed = true;
        return fix;
      }
      return word;
    })
    .join(" ");
  return changed ? corrected : null;
}

/** Flip the last word between singular and plural ("egg" <-> "eggs"). */
export function pluralFlip(query: string): string | null {
  const words = query.split(/\s+/);
  const last = words[words.length - 1];
  if (!/^[a-zA-Z]{2,}$/.test(last)) return null;
  words[words.length - 1] = last.toLowerCase().endsWith("s")
    ? last.slice(0, -1)
    : `${last}s`;
  const flipped = words.join(" ");
  return flipped === query ? null : flipped;
}

/**
 * Ordered, deduplicated fallback queries to try when `query` returns empty.
 * Spell correction comes first: it is null for valid words (costing nothing),
 * and for typos the corrected phrase beats a plural flip of the misspelling,
 * which can scrape up the same junk brand hits the original did.
 */
export function fallbackQueries(query: string): string[] {
  const variants = [correctQuery(query), pluralFlip(query)];
  const seen = new Set<string>([query.toLowerCase()]);
  const out: string[] = [];
  for (const v of variants) {
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}
