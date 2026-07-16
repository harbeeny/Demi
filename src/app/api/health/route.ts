import { NextResponse } from "next/server";

import { createClient } from "@supabase/supabase-js";

import { preflight, withCors } from "@/lib/plan/cors";

/**
 * Liveness + database reachability. Unauthenticated on purpose (uptime
 * monitors have no session) and answer-only-with-booleans: no versions,
 * no config, no counts, nothing an attacker can use. The DB probe is a
 * one-row read of the public meal catalog with the anon key, so RLS
 * semantics are exactly a signed-out client's.
 */
async function get(): Promise<Response> {
  const started = Date.now();
  let db = false;
  try {
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    );
    const probe = anon.from("meals").select("id").limit(1);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("db probe timeout")), 3_000),
    );
    const { error } = await Promise.race([probe, timeout]);
    db = !error;
  } catch {
    db = false;
  }
  return NextResponse.json(
    { ok: db, db, ms: Date.now() - started },
    { status: db ? 200 : 503 },
  );
}

export const GET = withCors(get);
export const OPTIONS = preflight("GET, OPTIONS");
