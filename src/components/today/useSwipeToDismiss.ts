"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Release decision for a bottom-sheet drag. Dismiss when the sheet was pulled
// past a quarter of its height, or released on a firm downward flick; otherwise
// it springs back. Tuned to feel like a native iOS sheet.
const DISMISS_FRACTION = 0.25;
const FLICK_VELOCITY = 0.55; // px per ms, downward

// One fixed timing for every open and every close, whichever path triggered
// it, so consecutive presses always play identically. Exit is slightly faster
// than enter; both use CSS transitions (not keyframes) so an interrupted
// animation retargets smoothly from wherever the sheet currently is.
export const ENTER_MS = 300;
export const EXIT_MS = 240;

export function shouldDismiss(offset: number, velocity: number, height: number): boolean {
  if (offset <= 0) return false;
  if (velocity >= FLICK_VELOCITY) return true;
  return offset >= height * DISMISS_FRACTION;
}

interface DragState {
  startY: number;
  lastY: number;
  lastT: number;
  velocity: number;
  offset: number;
  height: number;
  active: boolean;
  fromHandle: boolean;
}

const IDLE: DragState = {
  startY: 0,
  lastY: 0,
  lastT: 0,
  velocity: 0,
  offset: 0,
  height: 0,
  active: false,
  fromHandle: false,
};

// The gesture only begins after this much downward travel, so taps (on the X,
// on result rows) are never mistaken for a drag.
const START_THRESHOLD = 6;

/**
 * Bottom-sheet lifecycle: slide-up on open, slide-down on close, and
 * swipe-to-dismiss. A drag starts when the pointer goes down on the grab
 * handle (`data-drag-handle`) or when the scroll content is already at the
 * top; a downward pull translates the sheet 1:1 and releasing past the
 * threshold closes it. Every close path (X, backdrop, swipe) funnels through
 * the same exit transition, which retargets from the sheet's current position.
 * Render while `mounted`; the sheet stays in the DOM through the exit.
 */
export function useSwipeToDismiss(open: boolean, onClose: () => void) {
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState>({ ...IDLE });
  const exitTimer = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (open) {
      if (exitTimer.current !== null) {
        window.clearTimeout(exitTimer.current);
        exitTimer.current = null;
      }
      drag.current = { ...IDLE };
      setOffset(0);
      setDragging(false);
      setMounted(true);
      // Double rAF: the browser must paint the off-screen start before the
      // target lands, or the enter transition silently skips. This makes the
      // open animation identical on every press, including rapid re-opens.
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setEntered(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setEntered(false);
    exitTimer.current = window.setTimeout(() => {
      setMounted(false);
      exitTimer.current = null;
    }, EXIT_MS);
    return () => {
      if (exitTimer.current !== null) {
        window.clearTimeout(exitTimer.current);
        exitTimer.current = null;
      }
    };
  }, [open]);

  // React's onTouchMove is passive, so cancel the scroll/rubber-band from a
  // native non-passive listener once a dismiss drag owns the gesture.
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const cancelScroll = (e: TouchEvent) => {
      if (drag.current.active && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchmove", cancelScroll, { passive: false });
    return () => el.removeEventListener("touchmove", cancelScroll);
  }, [mounted]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!open) return;
      const fromHandle = !!(e.target as HTMLElement).closest("[data-drag-handle]");
      drag.current = {
        ...IDLE,
        startY: e.clientY,
        lastY: e.clientY,
        lastT: e.timeStamp,
        height: sheetRef.current?.offsetHeight ?? window.innerHeight,
        fromHandle,
      };
    },
    [open],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    const dy = e.clientY - d.startY;
    if (!d.active) {
      const atTop = (scrollRef.current?.scrollTop ?? 0) <= 0;
      if (dy > START_THRESHOLD && (d.fromHandle || atTop)) {
        d.active = true;
        setDragging(true);
        try {
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        } catch {
          // capture is best-effort; the gesture still works without it
        }
      } else {
        return;
      }
    }
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.velocity = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    d.offset = Math.max(0, dy);
    setOffset(d.offset);
  }, []);

  const finish = useCallback(() => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    setDragging(false);
    if (shouldDismiss(d.offset, d.velocity, d.height)) {
      // Hand off to the shared exit transition, which picks up from the
      // dragged position; no separate swipe-out animation to drift from.
      onClose();
    } else {
      setOffset(0);
      d.offset = 0;
    }
  }, [onClose]);

  // Safety net: if pointer capture fails and the release lands outside the
  // sheet, the element's own pointerup never fires and the drag would hang
  // mid-screen. A window listener guarantees every release finishes the drag
  // (finish is a no-op unless a drag is active, so taps are unaffected).
  useEffect(() => {
    const end = () => finish();
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [finish]);

  const progress = offset > 0 ? Math.min(1, offset / (drag.current.height || 1)) : 0;

  // Reduced motion keeps the fade but drops the movement; the drag itself
  // stays 1:1 because direct manipulation follows the finger, not a timer.
  const sheetStyle: React.CSSProperties = dragging
    ? { transform: `translateY(${offset}px)`, transition: "none" }
    : reducedMotion
      ? {
          opacity: entered ? 1 : 0,
          transition: `opacity ${entered ? ENTER_MS : EXIT_MS}ms ease`,
        }
      : {
          transform: entered ? "translateY(0)" : "translateY(100%)",
          transition: `transform ${entered ? ENTER_MS : EXIT_MS}ms var(--ease-drawer)`,
        };

  const backdropStyle: React.CSSProperties = {
    backgroundColor: dragging
      ? `rgba(0, 0, 0, ${(0.3 * (1 - progress)).toFixed(3)})`
      : `rgba(0, 0, 0, ${entered ? 0.3 : 0})`,
    transition: dragging
      ? "none"
      : `background-color ${entered ? ENTER_MS : EXIT_MS}ms var(--ease-drawer)`,
  };

  return {
    sheetRef,
    scrollRef,
    mounted,
    sheetStyle,
    backdropStyle,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    },
  };
}
