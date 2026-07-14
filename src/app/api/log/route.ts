import { NextResponse } from "next/server";

import { loadContext, todayISO } from "@/lib/plan/context";
import { syncDailyRollup } from "@/lib/log/persist";
import { validateEstimate } from "@/lib/ai/estimate";
import { containsDisorderedEatingSignal, SUPPORTIVE_RESPONSE } from "@/lib/ai/safety-filter";
import type { MealPlanEntry, MealSlot } from "@/lib/supabase/types";

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
      note?: string;
    };

/** Log something the user ate. */
export async function POST(request: Request) {
  const ctx = await loadContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, user } = ctx;

  const body = (await request.json().catch(() => null)) as LogBody | null;
  if (!body || !["planned", "db", "estimate"].includes(body.source)) {
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
  } else {
    // Estimate numbers are user-editable client values; re-check bounds here.
    const estimate = validateEstimate(body);
    if (!estimate) {
      return NextResponse.json({ error: "Those numbers look out of range." }, { status: 400 });
    }
    insert = {
      slot: null,
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
export async function DELETE(request: Request) {
  const ctx = await loadContext();
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
