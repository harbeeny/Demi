import { describe, expect, test } from "bun:test";

import {
  createSheetStack,
  shouldBeginDrag,
  shouldCloseOnEscape,
  shouldDismiss,
} from "./useSwipeToDismiss";

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

describe("shouldBeginDrag", () => {
  test("mouse hover (no press) never starts a drag, whatever the travel", () => {
    expect(shouldBeginDrag(false, 500, false, true)).toBe(false);
    expect(shouldBeginDrag(false, 500, true, true)).toBe(false);
  });

  test("a pressed downward pull starts from the handle or a top-scrolled body", () => {
    expect(shouldBeginDrag(true, 12, true, false)).toBe(true);
    expect(shouldBeginDrag(true, 12, false, true)).toBe(true);
  });

  test("a pressed pull mid-scroll stays with the content", () => {
    expect(shouldBeginDrag(true, 12, false, false)).toBe(false);
  });

  test("travel inside the tap slop never starts a drag", () => {
    expect(shouldBeginDrag(true, 5, true, true)).toBe(false);
  });
});

describe("createSheetStack", () => {
  test("a lone open sheet is the top", () => {
    const stack = createSheetStack();
    const sheet = {};
    stack.push(sheet);
    expect(stack.isTop(sheet)).toBe(true);
  });

  test("an empty stack has no top", () => {
    const stack = createSheetStack();
    expect(stack.isTop({})).toBe(false);
  });

  test("an inner sheet opened over an outer one takes the top", () => {
    const stack = createSheetStack();
    const outer = {};
    const inner = {};
    stack.push(outer);
    stack.push(inner);
    expect(stack.isTop(inner)).toBe(true);
    expect(stack.isTop(outer)).toBe(false);
  });

  test("closing the inner sheet hands the top back to the outer one", () => {
    const stack = createSheetStack();
    const outer = {};
    const inner = {};
    stack.push(outer);
    stack.push(inner);
    stack.release(inner);
    expect(stack.isTop(outer)).toBe(true);
  });

  test("an outer sheet closing under an open inner one leaves the inner on top", () => {
    const stack = createSheetStack();
    const outer = {};
    const inner = {};
    stack.push(outer);
    stack.push(inner);
    stack.release(outer);
    expect(stack.isTop(inner)).toBe(true);
  });

  test("releasing a sheet that never registered changes nothing", () => {
    const stack = createSheetStack();
    const sheet = {};
    stack.push(sheet);
    stack.release({});
    expect(stack.isTop(sheet)).toBe(true);
  });
});

describe("shouldCloseOnEscape", () => {
  const escape = {
    key: "Escape",
    repeat: false,
    isComposing: false,
    defaultPrevented: false,
  };

  test("a fresh Escape press closes the topmost sheet", () => {
    expect(shouldCloseOnEscape(escape, true)).toBe(true);
  });

  test("a sheet under the top one ignores the press", () => {
    expect(shouldCloseOnEscape(escape, false)).toBe(false);
  });

  test("only Escape dismisses", () => {
    expect(shouldCloseOnEscape({ ...escape, key: "Enter" }, true)).toBe(false);
  });

  test("auto-repeat from a held key must not cascade through a stack", () => {
    expect(shouldCloseOnEscape({ ...escape, repeat: true }, true)).toBe(false);
  });

  test("Escape that is cancelling IME composition leaves the sheet open", () => {
    expect(shouldCloseOnEscape({ ...escape, isComposing: true }, true)).toBe(false);
  });

  test("a control that already claimed the key keeps the sheet open", () => {
    expect(shouldCloseOnEscape({ ...escape, defaultPrevented: true }, true)).toBe(false);
  });
});
