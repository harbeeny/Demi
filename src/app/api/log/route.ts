import { NextResponse } from "next/server";

import { loadContext, todayISO } from "@/lib/plan/context";
import { syncDailyRollup } from "@/lib/log/persist";
import { validateEstimate } from "@/lib/ai/estimate";
import { containsDisorderedEatingSignal, SUPPORTIVE_RESPONSE } from "@/lib/ai/safety-filter";
import type { MealPlanEntry, MealSlot } from "@/lib/supabase/types";
import { preflight, withCors } from "@/lib/plan/cors";

const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

type LogBody =
  | { source: "planned"; slotIndex: number; note?: string }
  | { source: "db"; mealId: string; slot?: MealSlot; note?: string }
  | {
      source: "estimate";
      name: string;
      kcal: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
      slot?: MealSlot;
      note?: string;
    }
  | {
      source: "fdc";
      fdcId: number;
      name: string;
      grams?: number;
      kcal: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
      /** curated-source provenance badge; cosmetic, never trust-bearing */
      verified?: boolean;
      slot?: MealSlot;
      note?: string;
    };

/** Log something the user ate. */
async function post(request: Request): Promise<Response> {
  const ctx = await loadContext(request);
  if ("error" in ctx) return ctx.error;
  const { supabase, user } = ctx;

  const body = (await request.json().catch(() => null)) as LogBody | null;
  if (!body || !["planned", "db", "estimate", "fdc"].includes(body.source)) {
    return NextResponse.json({ error: "Invalid log payload." }, { status: 400 });
  }

  // Free-text notes are screened; on a signal we keep the log but drop the
  // note and hand the UI supportive copy instead.
  let note: string | null = typeof body.note === "string" ? body.note.trim().slice(0, 500) : null;
  let supportive: typeof SUPPORTIVE_RESPONSE | null = null;
  if (note && containsDisorderedEatingSignal(note)) {
    supportive = SUPPORTIVE_RESPONSE;
    note = null;
  }

  const date = todayISO();
  let insert: {
    slot: MealSlot | null;
    plan_slot_index: number | null;
    fdc_id?: number | null;
    verified?: boolean;
    meal_id: string | null;
    name: string;
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    source: LogBody["source"];
  };

  if (body.source === "planned") {
    // Macros come from the plan's meal row, never from the client.
    if (typeof body.slotIndex !== "number") {
      return NextResponse.json({ error: "slotIndex is required." }, { status: 400 });
    }
    const { data: planRow } = await supabase
      .from("meal_plans")
      .select("meals")
      .eq("user_id", user.id)
      .eq("date", date)
      .single();
    if (!planRow) {
      return NextResponse.json({ error: "No plan for today." }, { status: 404 });
    }
    const entry = (planRow.meals as MealPlanEntry[])[body.slotIndex];
    if (!entry) {
      return NextResponse.json({ error: "Invalid slot index." }, { status: 400 });
    }
    const { data: meal } = await supabase.from("meals").select("*").eq("id", entry.meal_id).single();
    if (!meal) {
      return NextResponse.json({ error: "Planned meal not found." }, { status: 404 });
    }
    insert = {
      slot: entry.slot,
      plan_slot_index: body.slotIndex,
      meal_id: meal.id,
      name: meal.name,
      kcal: Number(meal.kcal),
      protein_g: Number(meal.protein_g),
      carbs_g: Number(meal.carbs_g),
      fat_g: Number(meal.fat_g),
      source: "planned",
    };
  } else if (body.source === "db") {
    if (typeof body.mealId !== "string") {
      return NextResponse.json({ error: "mealId is required." }, { status: 400 });
    }
    const { data: meal } = await supabase.from("meals").select("*").eq("id", body.mealId).single();
    if (!meal) {
      return NextResponse.json({ error: "Meal not found." }, { status: 404 });
    }
    insert = {
      slot: body.slot && SLOTS.includes(body.slot) ? body.slot : null,
      plan_slot_index: null,
      meal_id: meal.id,
      name: meal.name,
      kcal: Number(meal.kcal),
      protein_g: Number(meal.protein_g),
      carbs_g: Number(meal.carbs_g),
      fat_g: Number(meal.fat_g),
      source: "db",
    };
  } else if (body.source === "fdc") {
    // Macros are client-computed from per-100g FDC data (visible before
    // save); same trust model as quick-add, bounded the same way.
    if (!Number.isInteger(body.fdcId) || body.fdcId <= 0) {
      return NextResponse.json({ error: "Invalid food reference." }, { status: 400 });
    }
    const checked = validateEstimate(body);
    if (!checked) {
      return NextResponse.json({ error: "Those numbers look out of range." }, { status: 400 });
    }
    const grams =
      Number.isFinite(body.grams) && Number(body.grams) > 0 ? Math.round(Number(body.grams)) : null;
    // the portion suffix must not push the name past the 120-char DB limit
    const baseName = grams ? checked.name.slice(0, 105) : checked.name;
    insert = {
      slot: body.slot && SLOTS.includes(body.slot) ? body.slot : null,
      plan_slot_index: null,
      fdc_id: body.fdcId,
      verified: body.verified === true,
      meal_id: null,
      name: grams ? `${baseName} (${grams} g)` : checked.name,
      kcal: checked.kcal,
      protein_g: checked.proteinG,
      carbs_g: checked.carbsG,
      fat_g: checked.fatG,
      source: "fdc",
    };
  } else {
    // Estimate numbers are user-editable client values; re-check bounds here.
    const estimate = validateEstimate(body);
    if (!estimate) {
      return NextResponse.json({ error: "Those numbers look out of range." }, { status: 400 });
    }
    insert = {
      slot: body.slot && SLOTS.includes(body.slot) ? body.slot : null,
      plan_slot_index: null,
      meal_id: null,
      name: estimate.name,
      kcal: estimate.kcal,
      protein_g: estimate.proteinG,
      carbs_g: estimate.carbsG,
      fat_g: estimate.fatG,
      source: "estimate",
    };
  }

  const { data: saved, error: insertError } = await supabase
    .from("meal_logs")
    .insert({ user_id: user.id, date, note, ...insert })
    .select("id")
    .single();

  if (insertError) {
    // Unique violation on the partial index = double tap on a planned slot.
    if (insertError.code === "23505") {
      return NextResponse.json({ ok: true, deduped: true });
    }
    return NextResponse.json({ error: "Couldn't save the log." }, { status: 500 });
  }

  const { error: rollupError } = await syncDailyRollup(supabase, user.id, date);
  if (rollupError) {
    return NextResponse.json({ error: rollupError }, { status: 500 });
  }

  return NextResponse.json({ ok: true, logId: saved.id, supportive });
}

/** Un-log an item. */
async function del(request: Request): Promise<Response> {
  const ctx = await loadContext(request);
  if ("error" in ctx) return ctx.error;
  const { supabase, user } = ctx;

  const body = (await request.json().catch(() => ({}))) as { logId?: string };
  if (typeof body.logId !== "string") {
    return NextResponse.json({ error: "logId is required." }, { status: 400 });
  }

  const { error: deleteError } = await supabase
    .from("meal_logs")
    .delete()
    .eq("id", body.logId)
    .eq("user_id", user.id);

  if (deleteError) {
    return NextResponse.json({ error: "Couldn't remove the log." }, { status: 500 });
  }

  const { error: rollupError } = await syncDailyRollup(supabase, user.id, todayISO());
  if (rollupError) {
    return NextResponse.json({ error: rollupError }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export const POST = withCors(post);
export const DELETE = withCors(del);
export const OPTIONS = preflight("POST, DELETE, OPTIONS");
