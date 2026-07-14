import { NextResponse } from "next/server";

import { buildCoachReply } from "@/lib/trainer";
import { containsDisorderedEatingSignal, SUPPORTIVE_RESPONSE } from "@/lib/ai/safety-filter";
import { preflight, withCors } from "@/lib/plan/cors";

async function post(request: Request): Promise<Response> {
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

  // This stays deliberately provider-agnostic for the first milestone. When a
  // model is connected, pass TRAINER_SYSTEM_PROMPT plus the conversation here.
  return NextResponse.json(buildCoachReply(message));
}

export const POST = withCors(post);
export const OPTIONS = preflight("POST, OPTIONS");
