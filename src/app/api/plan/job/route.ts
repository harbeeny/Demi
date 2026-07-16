import { NextResponse, after } from "next/server";

import { loadContext } from "@/lib/plan/context";
import { preflight, withCors } from "@/lib/plan/cors";
import { needsRun } from "@/lib/plan/jobs";
import { processJob } from "@/lib/plan/worker";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Job status for the client poll. Doubles as the queue's crash recovery:
 * a queued job (or one whose runner died mid-flight and went stale) is
 * re-claimed and re-run by the poll itself, so a build always makes
 * progress as long as anyone is waiting on it.
 */
async function get(request: Request): Promise<Response> {
  const ctx = await loadContext(request);
  if ("error" in ctx) return ctx.error;
  const { supabase, user, onboarding, meals, today, prefers24h } = ctx;

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid job id." }, { status: 400 });
  }

  // RLS scopes the read; the explicit filter documents intent.
  const { data: job } = await supabase
    .from("jobs")
    .select("id, status, attempts, claimed_at, error")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  if (needsRun(job)) {
    after(() =>
      processJob({ supabase, userId: user.id, onboarding, meals, today, prefers24h }, job.id),
    );
  }

  return NextResponse.json({
    status: job.status,
    error: job.status === "failed" ? job.error : null,
  });
}

export const GET = withCors(get);
export const OPTIONS = preflight("GET, OPTIONS");
