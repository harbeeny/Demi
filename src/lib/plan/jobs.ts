import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

/**
 * The plan-generation queue. Enqueue returns instantly; the worker runs in
 * the same serverless invocation after the response (next/server `after`),
 * and the client polls the job row. Crash recovery is poll-driven: a
 * claimed job whose runner died goes stale, and the next status poll
 * re-claims and re-runs it. No cron, no extra infra, and the jobs table
 * doubles as the queue-depth signal for observability.
 */

export type JobKind = "plan" | "week";
export type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

export const MAX_ATTEMPTS = 3;
/** A running job older than this is presumed dead and can be re-claimed. */
export const STALE_MS = 90_000;

export function isStale(claimedAt: string | null, now = Date.now()): boolean {
  if (!claimedAt) return true;
  return now - new Date(claimedAt).getTime() > STALE_MS;
}

/** Whether a poll should adopt (re-run) this job rather than just report it. */
export function needsRun(job: Pick<JobRow, "status" | "claimed_at" | "attempts">, now = Date.now()): boolean {
  if (job.attempts >= MAX_ATTEMPTS) return false;
  if (job.status === "queued") return true;
  return job.status === "running" && isStale(job.claimed_at, now);
}

/**
 * Create a job, or return the caller's existing live one of the same kind
 * (double-taps and the onboarding->today handoff dedupe to one build).
 */
export async function enqueueJob(
  supabase: SupabaseClient<Database>,
  userId: string,
  kind: JobKind,
  payload: Record<string, unknown>,
): Promise<{ id: string } | null> {
  const { data: active } = await supabase
    .from("jobs")
    .select("id, status, claimed_at, attempts")
    .eq("user_id", userId)
    .eq("kind", kind)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1);
  const existing = active?.[0];
  if (existing && (existing.status === "queued" || !isStale(existing.claimed_at))) {
    return { id: existing.id };
  }

  const { data, error } = await supabase
    .from("jobs")
    .insert({ user_id: userId, kind, payload: JSON.parse(JSON.stringify(payload)) })
    .select("id")
    .single();
  if (error || !data) return null;
  return { id: data.id };
}

/**
 * Optimistic claim: queued, or running-but-stale (dead runner). The status
 * filter makes concurrent claimers safe; only one update matches.
 */
export async function claimJob(
  supabase: SupabaseClient<Database>,
  jobId: string,
): Promise<JobRow | null> {
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  const { data } = await supabase
    .from("jobs")
    .update({ status: "running", claimed_at: new Date().toISOString() })
    .eq("id", jobId)
    .lt("attempts", MAX_ATTEMPTS)
    .or(`status.eq.queued,and(status.eq.running,claimed_at.lt.${cutoff})`)
    .select()
    .single();
  if (!data) return null;

  const { data: bumped } = await supabase
    .from("jobs")
    .update({ attempts: data.attempts + 1 })
    .eq("id", jobId)
    .select()
    .single();
  return bumped ?? data;
}
