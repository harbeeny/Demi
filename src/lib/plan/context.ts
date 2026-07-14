import "server-only";

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { Meal } from "@/lib/plan/select-meals";

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Shared context for the plan/log/day routes: authenticated user, their
 * latest onboarding answers, and the meal database.
 */
export async function loadContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };

  const { data: onboarding } = await supabase
    .from("onboarding_answers")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!onboarding) {
    return { error: NextResponse.json({ error: "Finish onboarding first." }, { status: 400 }) };
  }

  const { data: meals } = await supabase.from("meals").select("*");
  if (!meals || meals.length === 0) {
    return { error: NextResponse.json({ error: "Meal database is empty." }, { status: 500 }) };
  }

  return { supabase, user, onboarding, meals: meals as Meal[] };
}
