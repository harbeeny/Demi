// How each catalog ingredient is actually sold at a US grocery store. Pure
// data; the display/rounding logic lives in grocery.ts (storeAmount) so this
// module never imports back into it.
//
// Three shapes:
//   weight - loose items priced by the pound (meat counter, loose produce).
//   each   - produce grabbed by the piece; `grams` is a typical piece for
//            g-based items (omit for items already counted), `noun` names the
//            piece when the bare number would be ambiguous ("2 heads").
//   pack   - packaged goods; `size` is the usable amount in the item's
//            catalog unit, `noun` is the package ("can", "bag"), `detail`
//            the shelf size printed on it. `dozen` flags egg-carton labeling.
//
// Sizes are common mid-size packages, not brand promises: the point is a
// list that says "1 box (10 oz)" instead of "120 g", and a pantry that
// learns roughly what a purchase leaves behind.

import type { Unit } from "./grocery";

export type PackDef =
  | { kind: "weight" }
  | { kind: "each"; grams?: number; noun?: string }
  | { kind: "pack"; size: number; noun: string; detail?: string; dozen?: boolean };

export interface PackInfo {
  /** catalog unit this entry assumes; a mismatched line falls back to raw units */
  unit: Unit;
  def: PackDef;
}

const weight = (): PackInfo => ({ unit: "g", def: { kind: "weight" } });
const each = (grams?: number, noun?: string): PackInfo => ({
  unit: grams === undefined ? "count" : "g",
  def: { kind: "each", grams, noun },
});
const pack = (unit: Unit, size: number, noun: string, detail?: string): PackInfo => ({
  unit,
  def: { kind: "pack", size, noun, detail },
});

export const STORE_PACKS: Record<string, PackInfo> = {
  // meat & seafood: priced by the pound at the counter or tray
  "chicken breast": weight(),
  "chicken thigh": weight(),
  "ground beef": weight(),
  "ground turkey": weight(),
  "pork tenderloin": weight(),
  "sirloin steak": weight(),
  "cod fillet": weight(),
  "salmon fillet": weight(),
  "tilapia fillet": weight(),
  shrimp: weight(),
  "deli turkey": weight(),
  "smoked salmon": pack("g", 113, "pack", "4 oz"),
  "smoked trout": pack("g", 113, "pack", "4 oz"),
  "canned tuna": pack("g", 120, "can", "5 oz"),
  "canned sardines": pack("g", 92, "tin", "3.75 oz"),

  // produce by the piece (grams = one medium piece, edible)
  onion: each(110),
  tomato: each(120),
  "bell pepper": each(120),
  cucumber: each(200),
  zucchini: each(200),
  potato: each(200),
  "sweet potato": each(150),
  carrot: each(60),
  broccoli: each(300, "head"),
  mango: each(165),
  "honeydew melon": each(1500),
  pineapple: each(900),
  apple: each(),
  avocado: each(),
  banana: each(),
  lemon: each(),

  // produce sold packaged
  asparagus: pack("g", 450, "bunch"),
  "green beans": weight(),
  "cherry tomatoes": pack("g", 280, "pint"),
  "mixed berries": pack("g", 340, "pack", "12 oz"),
  "coleslaw mix": pack("g", 400, "bag", "14 oz"),
  "baby spinach": pack("cup", 5, "box", "5 oz"),
  "mixed greens": pack("cup", 5, "box", "5 oz"),
  tofu: pack("g", 400, "block", "14 oz"),
  garlic: pack("count", 10, "head"),

  // frozen
  edamame: pack("g", 300, "bag", "10 oz"),
  "frozen corn": pack("g", 340, "bag", "12 oz"),
  "frozen peas": pack("g", 340, "bag", "12 oz"),
  "veggie burger patty": pack("count", 4, "box", "4 ct"),

  // dairy & eggs
  egg: { unit: "count", def: { kind: "pack", size: 6, noun: "carton", dozen: true } },
  milk: pack("ml", 1900, "carton", "half gallon"),
  "soy milk": pack("ml", 946, "carton", "32 oz"),
  butter: pack("tbsp", 32, "box", "1 lb"),
  "cream cheese": pack("tbsp", 16, "brick", "8 oz"),
  "greek yogurt": pack("g", 900, "tub", "32 oz"),
  "cottage cheese": pack("g", 450, "tub", "16 oz"),
  "cheddar cheese": pack("g", 226, "block", "8 oz"),
  mozzarella: pack("g", 226, "block", "8 oz"),
  parmesan: pack("g", 140, "wedge", "5 oz"),
  "feta cheese": pack("g", 170, "block", "6 oz"),

  // grains & bread
  "whole wheat bread": pack("count", 20, "loaf"),
  "rye bread": pack("count", 20, "loaf"),
  bagel: pack("count", 6, "bag", "6 ct"),
  "burger bun": pack("count", 8, "bag", "8 ct"),
  "flour tortilla": pack("count", 10, "pack", "10 ct"),
  "corn tortilla": pack("count", 12, "pack", "12 ct"),
  "rice cake": pack("count", 14, "sleeve", "14 ct"),
  "white rice": pack("g", 900, "bag", "2 lb"),
  "brown rice": pack("g", 900, "bag", "2 lb"),
  quinoa: pack("g", 450, "bag", "1 lb"),
  couscous: pack("g", 280, "box", "10 oz"),
  "whole wheat pasta": pack("g", 450, "box", "1 lb"),
  "rolled oats": pack("g", 510, "canister", "18 oz"),
  granola: pack("cup", 3.5, "bag", "12 oz"),

  // pantry: cans and dry goods
  "black beans": pack("g", 250, "can", "15 oz"),
  chickpeas: pack("g", 250, "can", "15 oz"),
  "kidney beans": pack("g", 250, "can", "15 oz"),
  "white beans": pack("g", 250, "can", "15 oz"),
  "canned diced tomatoes": pack("g", 410, "can", "14.5 oz"),
  "dried lentils": pack("g", 450, "bag", "1 lb"),
  "tomato sauce": pack("ml", 425, "can", "15 oz"),
  "coconut milk": pack("ml", 400, "can", "13.5 oz"),
  almonds: pack("g", 227, "bag", "8 oz"),
  "mixed nuts": pack("g", 227, "bag", "8 oz"),
  "whey protein powder": pack("g", 900, "tub", "2 lb"),

  // pantry: jars, bottles, and spice jars (sizes in the recipe's spoon units)
  "olive oil": pack("tbsp", 34, "bottle", "500 ml"),
  "balsamic vinegar": pack("tbsp", 17, "bottle", "8.5 oz"),
  tamari: pack("tbsp", 20, "bottle", "10 oz"),
  "maple syrup": pack("tbsp", 16, "bottle", "8 oz"),
  mayonnaise: pack("tbsp", 30, "jar", "15 oz"),
  "dijon mustard": pack("tsp", 45, "jar", "8 oz"),
  "peanut butter": pack("tbsp", 28, "jar", "16 oz"),
  "almond butter": pack("tbsp", 21, "jar", "12 oz"),
  pesto: pack("tbsp", 12, "jar", "6.5 oz"),
  salsa: pack("tbsp", 32, "jar", "16 oz"),
  hummus: pack("tbsp", 19, "tub", "10 oz"),
  honey: pack("tsp", 48, "bottle", "12 oz"),
  "chia seeds": pack("tbsp", 28, "bag", "12 oz"),
  "sunflower seeds": pack("tbsp", 28, "bag", "8 oz"),
  raisins: pack("tbsp", 34, "box", "12 oz"),
  "baking powder": pack("tsp", 45, "can", "8 oz"),
  "cocoa powder": pack("tsp", 90, "container", "8 oz"),
  "chili powder": pack("tsp", 25, "jar"),
  "ground cumin": pack("tsp", 25, "jar"),
  "smoked paprika": pack("tsp", 25, "jar"),
  "curry powder": pack("tsp", 25, "jar"),
  "italian seasoning": pack("tsp", 25, "jar"),
  "ground cinnamon": pack("tsp", 25, "jar"),
};
