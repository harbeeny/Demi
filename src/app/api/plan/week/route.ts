import { NextResponse, after } from "next/server";

import { loadContext } from "@/lib/plan/context";
import { preflight, withCors } from "@/lib/plan/cors";
import { enqueueJob } from "@/lib/plan/jobs";
import { processJob } from "@/lib/plan/worker";
import { weekPrepCapViable } from "@/lib/plan/run";

// The response returns instantly, but the post-response worker may run up
// to two LLM personalize calls plus six deterministic generations.
export const maxDuration = 60;

/**
 * Enqueue the 7-day build and return immediately; the client polls
 * GET /api/plan/job. Days that already have plans are skipped by the worker.
 */
async function post(request: Request): Promise<Response> {
  const ctx = await loadContext(request);
  if ("error" in ctx) return ctx.error;
  const { supabase, user, onboarding, meals } = ctx;

  const body = (await request.json().catch(() => ({}))) as { maxPrepMin?: number };
  const maxPrepMin =
    Number.isFinite(body.maxPrepMin) && Number(body.maxPrepMin) > 0
      ? Number(body.maxPrepMin)
      : undefined;

  // Fail fast (and synchronously) when the prep cap leaves nothing to pick.
  if (!weekPrepCapViable(onboarding, meals, maxPrepMin)) {
    return NextResponse.json(
      { error: `No meals fit under ${maxPrepMin} minutes with your preferences.` },
      { status: 409 },
    );
  }

  const job = await enqueueJob(supabase, user.id, "week", {
    ...(maxPrepMin !== undefined ? { maxPrepMin } : {}),
  });
  if (!job) {
    return NextResponse.json({ error: "Couldn't queue the week build." }, { status: 500 });
  }

  after(() =>
    processJob(
      { supabase, userId: user.id, onboarding, meals, today: ctx.today, prefers24h: ctx.prefers24h },
      job.id,
    ),
  );

  return NextResponse.json({ ok: true, queued: true, jobId: job.id }, { status: 202 });
}

export const POST = withCors(post);
export const OPTIONS = preflight("POST, OPTIONS");
