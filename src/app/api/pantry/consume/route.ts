import { NextResponse } from "next/server";

import { preflight, withCors } from "@/lib/plan/cors";
import { createBearerClient, createClient } from "@/lib/supabase/server";
import { localDateISO } from "@/lib/dates";
import type { Ingredient } from "@/lib/plan/grocery";
import type { MealPlanEntry } from "@/lib/supabase/types";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Days of missed plans worth deducting; anything older is ancient history. */
const LOOKBACK_DAYS = 14;

function addDaysISO(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Advance the pantry consumption watermark: planned meals on days that have
 * fully passed are assumed cooked, and their ingredients leave the pantry.
 * Idempotent per local day. Decrements run BEFORE the watermark advances so
 * a partial failure retries on the safe side: the pantry undercounts and the
 * next list asks to buy a little extra, never the reverse.
 */
async function post(request: Request): Promise<Response> {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const supabase = bearer ? createBearerClient(bearer) : await createClient();
  const {
    data: { user },
    error: authError,
  } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();
  const today = localDateISO(profile?.timezone ?? "UTC");
  const yesterday = addDaysISO(today, -1);

  const { data: state } = await supabase
    .from("pantry_state")
    .select("consumed_until")
    .eq("user_id", user.id)
    .maybeSingle();

  // First sight of this pantry: nothing before now is deductible.
  if (!state) {
    await supabase.from("pantry_state").upsert({ user_id: user.id, consumed_until: yesterday });
    return NextResponse.json({ ok: true, consumed: 0 });
  }
  if (state.consumed_until >= yesterday) {
    return NextResponse.json({ ok: true, consumed: 0 });
  }

  const { data: pantry } = await supabase
    .from("pantry_items")
    .select("item, unit, qty")
    .eq("user_id", user.id)
    .gt("qty", 0);

  let consumed = 0;
  if (pantry && pantry.length > 0) {
    const floor = addDaysISO(today, -(LOOKBACK_DAYS + 1));
    const since = state.consumed_until > floor ? state.consumed_until : floor;
    const { data: plans } = await supabase
      .from("meal_plans")
      .select("meals")
      .eq("user_id", user.id)
      .gt("date", since)
      .lt("date", today);

    const entries = (plans ?? []).flatMap((p) => p.meals as MealPlanEntry[]);
    if (entries.length > 0) {
      const ids = [...new Set(entries.map((e) => e.meal_id))];
      const { data: meals } = await supabase.from("meals").select("id, ingredients").in("id", ids);
      const byId = new Map(
        (meals ?? []).map((m) => [m.id, ((m.ingredients as unknown as Ingredient[]) ?? [])]),
      );

      const used = new Map<string, { item: string; unit: string; qty: number }>();
      for (const entry of entries) {
        for (const ing of byId.get(entry.meal_id) ?? []) {
          const key = `${ing.item}|${ing.unit}`;
          const prev = used.get(key);
          const add = ing.qty * entry.servings;
          if (prev) prev.qty += add;
          else used.set(key, { item: ing.item, unit: ing.unit, qty: add });
        }
      }

      // Only touch rows the user actually owns; consumption never creates rows.
      const owned = new Set(pantry.map((r) => `${r.item}|${r.unit}`));
      const deltas = [...used.values()].filter((u) => owned.has(`${u.item}|${u.unit}`));
      const results = await Promise.all(
        deltas.map((u) =>
          supabase.rpc("pantry_add", { p_item: u.item, p_unit: u.unit, p_delta: -u.qty }),
        ),
      );
      if (results.some((r) => r.error)) {
        return NextResponse.json({ error: "Couldn't update the pantry." }, { status: 500 });
      }
      consumed = deltas.length;
    }
  }

  await supabase.from("pantry_state").upsert({ user_id: user.id, consumed_until: yesterday });
  return NextResponse.json({ ok: true, consumed });
}

export const POST = withCors(post);
export const OPTIONS = preflight("POST, OPTIONS");
