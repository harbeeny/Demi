import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

// Per-user daily caps for the paid/expensive surface. Guest sign-in is one tap
// and unlimited accounts can be minted, so these bound the blast radius per
// account; a global spend ceiling in the provider console is the backstop.
export const QUOTA = {
  // Anthropic-backed generation: plan build/regenerate, quick-add estimate,
  // day-finish reflection, week plan. Comfortably above real daily use.
  llm: 40,
  // USDA FoodData Central proxy (shared 1,000 req/hr key across all users).
  fdc: 150,
} as const;

export type QuotaBucket = keyof typeof QUOTA;

/**
 * Atomically consume one unit of the caller's daily budget for a bucket.
 * Returns true when the call is allowed (and recorded), false when the cap is
 * reached. Fails closed: any RPC error denies the call. The counter lives in a
 * schema PostgREST does not expose, so a user cannot read or reset it.
 */
export async function consumeQuota(
  supabase: SupabaseClient<Database>,
  bucket: QuotaBucket,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("consume_quota", {
    p_bucket: bucket,
    p_limit: QUOTA[bucket],
  });
  if (error) return false;
  return data === true;
}

/** 429 response for an exhausted bucket, with copy that fits the app's voice. */
export function quotaExceeded(bucket: QuotaBucket): NextResponse {
  const message =
    bucket === "fdc"
      ? "You've hit today's food-search limit. It resets tomorrow."
      : "You've reached today's limit for generated suggestions. It resets tomorrow.";
  return NextResponse.json({ error: message }, { status: 429 });
}
