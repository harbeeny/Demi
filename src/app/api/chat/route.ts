import { NextResponse } from "next/server";

import { buildCoachReply } from "@/lib/trainer";

export async function POST(request: Request) {
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

  // This stays deliberately provider-agnostic for the first milestone. When a
  // model is connected, pass TRAINER_SYSTEM_PROMPT plus the conversation here.
  return NextResponse.json(buildCoachReply(message));
}
