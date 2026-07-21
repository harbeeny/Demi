import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { clearSnapshots, readSnapshot, writeSnapshot } from "./tab-cache";

/** Minimal localStorage stand-in so the persistence path runs under bun. */
function fakeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
    _store: store,
  };
}

let storage: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  storage = fakeStorage();
  (globalThis as Record<string, unknown>).localStorage = storage;
  clearSnapshots();
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).localStorage;
});

describe("tab-cache", () => {
  test("write then read round-trips", () => {
    writeSnapshot("today:u1:2026-07-21", { kcal: 1900 });
    expect(readSnapshot<{ kcal: number }>("today:u1:2026-07-21")).toEqual({ kcal: 1900 });
  });

  test("unknown key reads null", () => {
    expect(readSnapshot("nope")).toBeNull();
  });

  test("survives a fresh process via storage (memory cleared)", () => {
    writeSnapshot("kitchen:u1:2026-07-20", { days: 7 });
    clearMemoryOnly();
    expect(readSnapshot<{ days: number }>("kitchen:u1:2026-07-20")).toEqual({ days: 7 });
  });

  test("stale envelope is not painted", () => {
    writeSnapshot("progress:u1", { n: 1 });
    clearMemoryOnly();
    const key = "demi:snap:progress:u1";
    const env = JSON.parse(storage.getItem(key) ?? "{}") as { v: number; at: number };
    storage.setItem(key, JSON.stringify({ ...env, at: Date.now() - 25 * 60 * 60 * 1000, data: { n: 1 } }));
    expect(readSnapshot("progress:u1")).toBeNull();
  });

  test("version mismatch is discarded", () => {
    writeSnapshot("progress:u1", { n: 1 });
    clearMemoryOnly();
    const key = "demi:snap:progress:u1";
    const env = JSON.parse(storage.getItem(key) ?? "{}") as { at: number };
    storage.setItem(key, JSON.stringify({ v: 999, at: env.at, data: { n: 1 } }));
    expect(readSnapshot("progress:u1")).toBeNull();
  });

  test("clearSnapshots wipes memory and storage, other keys untouched", () => {
    writeSnapshot("today:u1:2026-07-21", { kcal: 1900 });
    storage.setItem("demi:theme", "dark");
    clearSnapshots();
    expect(readSnapshot("today:u1:2026-07-21")).toBeNull();
    expect(storage.getItem("demi:theme")).toBe("dark");
  });
});

/**
 * clearSnapshots wipes storage too, so simulate a fresh process (empty
 * module memory, storage intact) by clearing via a throwaway storage swap.
 */
function clearMemoryOnly() {
  const real = (globalThis as Record<string, unknown>).localStorage;
  (globalThis as Record<string, unknown>).localStorage = fakeStorage();
  clearSnapshots();
  (globalThis as Record<string, unknown>).localStorage = real;
}
