import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { createBearerClient, createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { Meal } from "@/lib/plan/select-meals";
import { localDateISO } from "@/lib/dates";

/** UTC date; only for user-agnostic contexts. Routes should use ctx.today. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

type OnboardingRow = Database["public"]["Tables"]["onboarding_answers"]["Row"];

/** Explicit union so `"error" in ctx` narrows cleanly at every callsite. */
export type RouteContext =
  | { error: NextResponse }
  | {
      supabase: SupabaseClient<Database>;
      user: User;
      onboarding: OnboardingRow;
      meals: Meal[];
      /** the user's IANA timezone from their profile, null when unset */
      timezone: string | null;
      /** clock preference from their profile; null means unknown (12-hour) */
      prefers24h: boolean | null;
      /** the user's local calendar day (falls back to UTC without a timezone) */
      today: string;
    };

/**
 * Shared context for the plan/log/day routes: authenticated user, their
 * latest onboarding answers, and the meal database.
 *
 * Auth accepts either the web's cookie session or an Authorization: Bearer
 * token from the Capacitor shell. The bearer path validates the token against
 * the Auth server via getUser(jwt); it is never trust-decoded locally.
 */
export async function loadContext(request: Request): Promise<RouteContext> {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const supabase: SupabaseClient<Database> = bearer
    ? createBearerClient(bearer)
    : await createClient();

  const {
    data: { user },
    error: authError,
  } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser();
  if (authError || !user) {
    return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  }

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

  const [{ data: meals }, { data: profile }] = await Promise.all([
    supabase.from("meals").select("*"),
    supabase.from("profiles").select("timezone, prefers_24h_time").eq("id", user.id).maybeSingle(),
  ]);
  if (!meals || meals.length === 0) {
    return { error: NextResponse.json({ error: "Meal database is empty." }, { status: 500 }) };
  }

  const timezone = profile?.timezone ?? null;
  return {
    supabase,
    user,
    onboarding,
    meals: meals as Meal[],
    timezone,
    prefers24h: profile?.prefers_24h_time ?? null,
    today: localDateISO(timezone ?? "UTC"),
  };
}
