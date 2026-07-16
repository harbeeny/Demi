import { claimJob, MAX_ATTEMPTS } from "./jobs";
import { runPlanJob, runWeekJob, type RunDeps } from "./run";

/**
 * The queue worker. Separate from jobs.ts so the pure queue policy stays
 * importable in tests without dragging in the server-only generation chain.
 */

/** Claim, run, record the outcome. Never throws: failures land on the row. */
export async function processJob(deps: RunDeps, jobId: string): Promise<void> {
  const job = await claimJob(deps.supabase, jobId);
  if (!job) return; // someone else has it, it's finished, or attempts ran out

  let result;
  try {
    result =
      job.kind === "week"
        ? await runWeekJob(deps, (job.payload ?? {}) as { maxPrepMin?: number })
        : await runPlanJob(deps, (job.payload ?? {}) as Record<string, unknown>);
  } catch (err) {
    console.error(`job ${jobId} (${job.kind}) threw:`, err);
    result = { ok: false as const, error: "Plan generation hit an unexpected error." };
  }

  if (result.ok) {
    await deps.supabase
      .from("jobs")
      .update({ status: "done", finished_at: new Date().toISOString(), error: null })
      .eq("id", jobId);
    return;
  }

  // Retryable failures go back to queued while attempts remain; the next
  // poll re-claims. Permanent ones (quota) fail immediately with the
  // friendly message for the client to surface.
  const outOfAttempts = job.attempts >= MAX_ATTEMPTS;
  const failed = result.permanent || outOfAttempts;
  await deps.supabase
    .from("jobs")
    .update(
      failed
        ? { status: "failed", finished_at: new Date().toISOString(), error: result.error }
        : { status: "queued", error: result.error },
    )
    .eq("id", jobId);
}
