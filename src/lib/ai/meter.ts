import { AsyncLocalStorage } from "node:async_hooks";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

/**
 * LLM spend metering. Routes wrap their model-touching work in
 * withUsageMeter(...) and the provider reports every response's token
 * usage through recordUsage; each call lands in usage_events with an
 * estimated cost. AsyncLocalStorage keeps concurrent requests separate
 * inside one serverless instance, and metering is strictly best-effort:
 * a failed insert never breaks the user's request.
 */

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

interface MeterContext {
  supabase: SupabaseClient<Database>;
  userId: string;
  /** which feature spent it: plan | week | estimate | reflect | label */
  kind: string;
}

const meterStore = new AsyncLocalStorage<MeterContext>();

/** USD per million tokens, by model-id prefix; longest prefix wins. */
const PRICING: Array<{ prefix: string; inPerMTok: number; outPerMTok: number }> = [
  { prefix: "claude-haiku-4-5", inPerMTok: 1, outPerMTok: 5 },
  { prefix: "claude-sonnet-5", inPerMTok: 3, outPerMTok: 15 },
  { prefix: "claude-sonnet-4", inPerMTok: 3, outPerMTok: 15 },
  { prefix: "claude-opus-4", inPerMTok: 15, outPerMTok: 75 },
];
// Unknown models assume the priciest tier so estimates err high, never low.
const FALLBACK = { inPerMTok: 15, outPerMTok: 75 };

export function estCostUsd(model: string, usage: TokenUsage): number {
  const rate =
    PRICING.filter((p) => model.startsWith(p.prefix)).sort(
      (a, b) => b.prefix.length - a.prefix.length,
    )[0] ?? FALLBACK;
  const usd =
    (usage.inputTokens / 1_000_000) * rate.inPerMTok +
    (usage.outputTokens / 1_000_000) * rate.outPerMTok;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/** Run fn with a usage meter attached; every chat() inside is logged. */
export function withUsageMeter<T>(ctx: MeterContext, fn: () => Promise<T>): Promise<T> {
  return meterStore.run(ctx, fn);
}

/** Called by the provider after each response; no-op outside a meter. */
export function recordUsage(model: string, usage: TokenUsage): void {
  const ctx = meterStore.getStore();
  if (!ctx) return;
  void ctx.supabase
    .from("usage_events")
    .insert({
      user_id: ctx.userId,
      kind: ctx.kind,
      model,
      input_tokens: Math.max(0, Math.round(usage.inputTokens)),
      output_tokens: Math.max(0, Math.round(usage.outputTokens)),
      est_cost_usd: estCostUsd(model, usage),
    })
    .then(({ error }) => {
      if (error) console.error("usage_events insert failed:", error.message);
    });
}
