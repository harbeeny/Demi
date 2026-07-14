import { NextResponse } from "next/server";

import { loadContext, todayISO } from "@/lib/plan/context";
import { preflight, withCors } from "@/lib/plan/cors";

/** Record a weight check-in (kg; the UI converts from lbs). Upsert per day. */
async function post(request: Request): Promise<Response> {
  const ctx = await loadContext(request);
  if ("error" in ctx) return ctx.error;
  const { supabase, user } = ctx;

  const body = (await request.json().catch(() => ({}))) as {
    weightKg?: number;
    date?: string;
  };

  const weightKg = Number(body.weightKg);
  if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg >= 500) {
    return NextResponse.json({ error: "That weight looks out of range." }, { status: 400 });
  }
  const date =
    typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : todayISO();

  const { error } = await supabase.from("weight_logs").upsert(
    { user_id: user.id, date, weight_kg: Math.round(weightKg * 10) / 10 },
    { onConflict: "user_id,date" },
  );

  if (error) {
    return NextResponse.json({ error: "Couldn't save your check-in." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** Weight history, ascending, for the trend chart. */
async function get(request: Request): Promise<Response> {
  const ctx = await loadContext(request);
  if ("error" in ctx) return ctx.error;
  const { supabase, user } = ctx;

  const url = new URL(request.url);
  const days = Math.min(365, Math.max(7, Number(url.searchParams.get("days")) || 90));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("weight_logs")
    .select("date, weight_kg")
    .eq("user_id", user.id)
    .gte("date", since)
    .order("date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Couldn't load your history." }, { status: 500 });
  }
  return NextResponse.json({
    weighIns: (data ?? []).map((w) => ({ date: w.date, weightKg: Number(w.weight_kg) })),
  });
}

export const POST = withCors(post);
export const GET = withCors(get);
export const OPTIONS = preflight("GET, POST, OPTIONS");
