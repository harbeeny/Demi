"use client";

// Client half of the pantry: check-offs push package amounts through the
// pantry_add RPC, and a localStorage outbox catches writes made in a dead
// spot at the store (they replay on the next Kitchen load). A per-list
// purchase log remembers what each check-off added so un-checking reverses
// exactly that amount and a mid-shop reload keeps the same baseline.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export interface PantryDelta {
  item: string;
  unit: string;
  delta: number;
}

const OUTBOX_KEY = "demi:pantry:outbox";
const OUTBOX_MAX = 50;

function readOutbox(): PantryDelta[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    return raw ? (JSON.parse(raw) as PantryDelta[]) : [];
  } catch {
    return [];
  }
}

function writeOutbox(list: PantryDelta[]): void {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(list.slice(-OUTBOX_MAX)));
  } catch {
    // storage unavailable: the delta is lost, the list just over-asks later
  }
}

async function rpcAdd(supabase: Client, d: PantryDelta): Promise<"ok" | "retry" | "drop"> {
  try {
    const { error } = await supabase.rpc("pantry_add", {
      p_item: d.item,
      p_unit: d.unit,
      p_delta: d.delta,
    });
    if (!error) return "ok";
    // A PostgREST code means the server rejected it for good; retrying
    // forever would just wedge the outbox.
    return error.code ? "drop" : "retry";
  } catch {
    return "retry";
  }
}

/** Apply a pantry delta now, or park it in the outbox until we're back online. */
export async function pantryAdd(supabase: Client, d: PantryDelta): Promise<void> {
  if ((await rpcAdd(supabase, d)) === "retry") writeOutbox([...readOutbox(), d]);
}

/** Replay parked deltas; whatever still fails stays parked. */
export async function flushPantryOutbox(supabase: Client): Promise<void> {
  const pending = readOutbox();
  if (pending.length === 0) return;
  writeOutbox([]);
  const failed: PantryDelta[] = [];
  for (const d of pending) {
    if ((await rpcAdd(supabase, d)) === "retry") failed.push(d);
  }
  // readOutbox again: a check-off may have parked new deltas mid-flush
  if (failed.length > 0) writeOutbox([...failed, ...readOutbox()]);
}

// --- per-list purchase log ------------------------------------------------
// Keyed `${storageKey}:log` so the existing two-week grocery-key pruning
// sweeps it up with the check-offs it belongs to.

export function readPurchaseLog(storageKey: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(`${storageKey}:log`);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writePurchaseLog(storageKey: string, log: Record<string, number>): void {
  try {
    localStorage.setItem(`${storageKey}:log`, JSON.stringify(log));
  } catch {
    // ignore
  }
}

export function logPurchase(storageKey: string, lineKey: string, amount: number): void {
  writePurchaseLog(storageKey, { ...readPurchaseLog(storageKey), [lineKey]: amount });
}

/** Remove and return the logged amount for a line, if any. */
export function unlogPurchase(storageKey: string, lineKey: string): number | undefined {
  const log = readPurchaseLog(storageKey);
  const amount = log[lineKey];
  if (amount !== undefined) {
    delete log[lineKey];
    writePurchaseLog(storageKey, log);
  }
  return amount;
}
