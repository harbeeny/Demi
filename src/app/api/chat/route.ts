import { NextResponse } from "next/server";

import { buildCoachReply } from "@/lib/trainer";
import { containsDisorderedEatingSignal, SUPPORTIVE_RESPONSE } from "@/lib/ai/safety-filter";
import { loadContext } from "@/lib/plan/context";
import { preflight, withCors } from "@/lib/plan/cors";

async function post(request: Request): Promise<Response> {
  // Auth up front: the reply is a deterministic stub today, but this is where a
  // model gets wired in (see below). Gating now keeps it from ever becoming an
  // unauthenticated, unmetered LLM endpoint.
  const ctx = await loadContext(request);
  if ("error" in ctx) return ctx.error;

  const body = (await request.json()) as { message?: unknown };
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!message) {
    return NextResponse.json({ error: "Please write a message first." }, { status: 400 });
  }

  if (message.length > 1_000) {
    return NextResponse.json(
      { error: "Keep your message under 1,000 characters for now." },
      { status: 400 },
    );
  }

  // SAFETY: screen before any coaching logic runs.
  if (containsDisorderedEatingSignal(message)) {
    return NextResponse.json(SUPPORTIVE_RESPONSE);
  }

  // This stays deliberately provider-agnostic for the first milestone. The
  // reply is a deterministic stub, so it does NOT consume the LLM quota. When a
  // model is connected here (pass TRAINER_SYSTEM_PROMPT plus the conversation),
  // meter it first so it can't be looped for free:
  //   if (!(await consumeQuota(supabase, "llm"))) return quotaExceeded("llm");
  return NextResponse.json(buildCoachReply(message));
}

export const POST = withCors(post);
export const OPTIONS = preflight("POST, OPTIONS");
