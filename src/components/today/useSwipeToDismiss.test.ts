import { describe, expect, test } from "bun:test";

import { shouldDismiss } from "./useSwipeToDismiss";

const HEIGHT = 800; // a typical 90dvh sheet on a phone

describe("shouldDismiss", () => {
  test("springs back when the pull is small and slow", () => {
    expect(shouldDismiss(80, 0.1, HEIGHT)).toBe(false);
  });

  test("dismisses once dragged past a quarter of the height", () => {
    expect(shouldDismiss(HEIGHT * 0.25, 0, HEIGHT)).toBe(true);
    expect(shouldDismiss(HEIGHT * 0.25 - 1, 0, HEIGHT)).toBe(false);
  });

  test("a firm downward flick dismisses even on a short pull", () => {
    expect(shouldDismiss(40, 0.8, HEIGHT)).toBe(true);
  });

  test("a slow release just under the distance threshold springs back", () => {
    expect(shouldDismiss(HEIGHT * 0.2, 0.2, HEIGHT)).toBe(false);
  });

  test("never dismisses with no downward movement", () => {
    expect(shouldDismiss(0, 5, HEIGHT)).toBe(false);
    expect(shouldDismiss(-50, 5, HEIGHT)).toBe(false);
  });

  test("an upward flick (negative velocity) never dismisses on its own", () => {
    expect(shouldDismiss(50, -2, HEIGHT)).toBe(false);
  });
});
