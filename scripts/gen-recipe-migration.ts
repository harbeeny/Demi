// One-shot generator: renders the phase 4 migration SQL from the typed seed
// module. Run with `bun scripts/gen-recipe-migration.ts > out.sql` during
// implementation; the committed migration is the source of truth afterward.

import { NEW_MEALS, RECIPE_SEED } from "../src/lib/plan/recipes.seed";

const sq = (s: string) => s.replace(/'/g, "''");

const lines: string[] = [];

lines.push(`-- Phase 4: recipes and grocery data.
-- Part 1: recipe columns. Part 2: ten new meals adapted from USDA MyPlate
-- Kitchen (public domain; instructions are original prose). Part 3: recipe
-- backfill for the whole catalog, generated from src/lib/plan/recipes.seed.ts.

alter table public.meals
  add column if not exists ingredients  jsonb   not null default '[]'::jsonb,
  add column if not exists instructions text[]  not null default '{}',
  add column if not exists prep_min     integer not null default 0,
  add column if not exists cook_min     integer not null default 0;
`);

lines.push("insert into public.meals (name, kcal, protein_g, carbs_g, fat_g, fiber_g, tags, source) values");
lines.push(
  NEW_MEALS.map(
    (m) =>
      `  ('${sq(m.name)}', ${m.kcal}, ${m.proteinG}, ${m.carbsG}, ${m.fatG}, ${m.fiberG}, '{${m.tags.join(",")}}', '${sq(m.source)}')`,
  ).join(",\n") + ";\n",
);

for (const [name, seed] of Object.entries(RECIPE_SEED)) {
  const ingredients = sq(JSON.stringify(seed.ingredients));
  const steps = seed.instructions.map((s) => `'${sq(s)}'`).join(", ");
  lines.push(`update public.meals set
  ingredients  = '${ingredients}'::jsonb,
  instructions = array[${steps}],
  prep_min = ${seed.prepMin},
  cook_min = ${seed.cookMin}
where name = '${sq(name)}';
`);
}

console.log(lines.join("\n"));
