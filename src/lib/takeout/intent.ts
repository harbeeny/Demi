import { Capacitor } from "@capacitor/core";

import { createClient } from "@/lib/supabase/client";
import type { Goal, TakeoutProvider, TakeoutSurface } from "@/lib/supabase/types";
import { openTakeoutSearch } from "./open";

export interface TakeoutIntent {
  provider: TakeoutProvider;
  mealId: string | null;
  dishQuery: string;
  /** whether the UI showed the confident "fits your macros" badge */
  hadMacroMatch: boolean;
  goal: Goal | null;
  surface: TakeoutSurface;
}

/**
 * Record the intent tap, then hand off to the provider. The tap log is the
 * whole point of the fake-door, but it must never cost the user their
 * redirect: the insert is best-effort (RLS-scoped, swallows errors like
 * usage metering does) and never blocks the handoff beyond a short cap.
 *
 * Ordering is platform-aware. Native waits out the insert up to LOG_CAP_MS
 * before launching, because opening DoorDash backgrounds the shell and iOS
 * may freeze an in-flight request; there is no popup blocker to appease.
 * The web opens immediately after firing the insert, because window.open
 * must stay inside the tap's transient activation to survive Safari's
 * popup heuristics, and the page stays alive to finish the write.
 */
export async function recordAndOpenTakeout(intent: TakeoutIntent): Promise<void> {
  const insert = logTakeoutIntent(intent);
  if (Capacitor.isNativePlatform()) {
    await Promise.race([insert, sleep(LOG_CAP_MS)]);
  }
  await openTakeoutSearch(intent.provider, intent.dishQuery);
}

const LOG_CAP_MS = 600;

async function logTakeoutIntent(intent: TakeoutIntent): Promise<void> {
  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;
    await supabase.from("takeout_intent_events").insert({
      user_id: user.id,
      provider: intent.provider,
      meal_id: intent.mealId,
      // the DB check bounds dish_query at 200 chars; clamp instead of failing
      dish_query: intent.dishQuery.trim().slice(0, 200),
      had_macro_match: intent.hadMacroMatch,
      goal: intent.goal,
      surface: intent.surface,
    });
  } catch {
    // demand data is best-effort; the user's handoff always proceeds
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
