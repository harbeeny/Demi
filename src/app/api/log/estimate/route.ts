import { NextResponse } from "next/server";

import { loadContext } from "@/lib/plan/context";
import { estimateMacros } from "@/lib/ai/estimate";
import { containsDisorderedEatingSignal, SUPPORTIVE_RESPONSE } from "@/lib/ai/safety-filter";
import { preflight, withCors } from "@/lib/plan/cors";

/** Estimate macros for a free-text food description. Persists nothing. */
async function post(request: Request): Promise<Response> {
  const ctx = await loadContext(request);
  if ("error" in ctx) return ctx.error;

  const body = (await request.json().catch(() => ({}))) as { text?: string };
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 300) : "";
  if (!text) {
    return NextResponse.json({ error: "Describe what you ate." }, { status: 400 });
  }

  if (containsDisorderedEatingSignal(text)) {
    return NextResponse.json({ supportive: SUPPORTIVE_RESPONSE });
  }

  const estimate = await estimateMacros(text);
  if (!estimate) {
    return NextResponse.json(
      { error: "Couldn't estimate that. Enter the numbers yourself below.", manual: true },
      { status: 422 },
    );
  }

  return NextResponse.json({ estimate, isEstimate: true });
}

export const POST = withCors(post);
export const OPTIONS = preflight("POST, OPTIONS");
