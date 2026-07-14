import { NextResponse } from "next/server";

import { loadContext, todayISO } from "@/lib/plan/context";
import { preflight, withCors } from "@/lib/plan/cors";

/**
 * Everything Demi knows about the user, as one JSON download. Device push
 * tokens are deliberately excluded (they identify the device, not the diet).
 */
async function get(request: Request): Promise<Response> {
  const ctx = await loadContext(request);
  if ("error" in ctx) return ctx.error;
  const { supabase, user } = ctx;

  const [profileHistory, plans, mealLogs, dailyLogs, weighIns, adjustments] = await Promise.all([
    supabase.from("onboarding_answers").select("*").eq("user_id", user.id).order("created_at"),
    supabase.from("meal_plans").select("*").eq("user_id", user.id).order("date"),
    supabase.from("meal_logs").select("*").eq("user_id", user.id).order("logged_at"),
    supabase.from("daily_logs").select("*").eq("user_id", user.id).order("date"),
    supabase.from("weight_logs").select("*").eq("user_id", user.id).order("date"),
    supabase.from("target_adjustments").select("*").eq("user_id", user.id).order("created_at"),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    app: "Demi",
    userId: user.id,
    email: user.email ?? null,
    profileHistory: profileHistory.data ?? [],
    mealPlans: plans.data ?? [],
    mealLogs: mealLogs.data ?? [],
    dailyLogs: dailyLogs.data ?? [],
    weighIns: weighIns.data ?? [],
    targetAdjustments: adjustments.data ?? [],
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="demi-export-${todayISO()}.json"`,
    },
  });
}

export const GET = withCors(get);
export const OPTIONS = preflight("GET, OPTIONS");
