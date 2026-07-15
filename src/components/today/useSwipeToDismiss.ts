"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Release decision for a bottom-sheet drag. Dismiss when the sheet was pulled
// past a quarter of its height, or released on a firm downward flick; otherwise
// it springs back. Tuned to feel like a native iOS sheet.
const DISMISS_FRACTION = 0.25;
const FLICK_VELOCITY = 0.55; // px per ms, downward

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
 * Swipe-to-dismiss for a bottom sheet. A drag starts when the pointer goes down
 * on the grab handle (`data-drag-handle`) or when the scroll content is already
 * at the top; either way a downward pull translates the sheet 1:1 and releasing
 * past the threshold closes it. Works for touch and mouse via pointer events.
 */
export function useSwipeToDismiss(open: boolean, onClose: () => void) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState>({ ...IDLE });

  // Reset the transform whenever the sheet (re)opens.
  useEffect(() => {
    if (open) {
      drag.current = { ...IDLE };
      setOffset(0);
      setDragging(false);
      setClosing(false);
    }
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
  }, [open]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (closing) return;
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
    [closing],
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
      setClosing(true);
      setOffset(d.height);
      window.setTimeout(onClose, 260);
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

  return {
    sheetRef,
    scrollRef,
    offset,
    dragging,
    progress,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    },
  };
}
