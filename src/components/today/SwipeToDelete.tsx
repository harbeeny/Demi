"use client";

import { useEffect, useRef, useState } from "react";

import { deleteHaptic, tapHaptic } from "@/lib/haptics";

/**
 * iOS-style swipe-to-delete wrapper for list rows. Drag left to reveal a
 * red Delete action; keep pulling past the commit zone (or flick) to delete
 * in one motion. Pointer-based with a horizontal intent lock so vertical
 * scrolling never fights the gesture, and transform writes go straight to
 * the DOM so tracking stays off the React render path. The wrapped row must
 * keep its own tap affordance (Undo) as the accessible, non-gesture path.
 */

/** iOS lists keep at most one row's action revealed; a new swipe closes it. */
let closeOpenRow: (() => void) | null = null;

const REVEAL_W = 88;
/** Fraction of row width that arms the one-motion delete. */
const COMMIT_AT = 0.55;
/** Release velocities in px/ms: a hard flick deletes, a soft one reveals. */
const FLICK_COMMIT = 0.5;
const FLICK_OPEN = 0.11;

function settleEase(): string {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "none";
  } catch {
    // matchMedia unavailable: keep the transition
  }
  return "transform 220ms cubic-bezier(0.23, 1, 0.32, 1)";
}

export function SwipeToDelete({
  onDelete,
  disabled = false,
  transitionName,
  children,
}: {
  /** resolves false when the delete failed; the row springs back */
  onDelete: () => Promise<boolean>;
  disabled?: boolean;
  /**
   * view-transition-name for the WHOLE row unit. It must live on this
   * wrapper, not the inner card: a named element is lifted out of normal
   * paint during a morph, and naming only the card would leave the red
   * underlay visible in the page while the card animates above it.
   */
  transitionName?: string;
  children: React.ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const x = useRef(0);
  const openRef = useRef(false);
  const armed = useRef(false);
  const suppressClick = useRef(false);
  const drag = useRef<{
    id: number;
    startX: number;
    startY: number;
    baseX: number;
    claimed: boolean;
    moves: Array<{ t: number; x: number }>;
  } | null>(null);
  const [committing, setCommitting] = useState(false);

  const setX = (v: number, transition: string) => {
    const el = contentRef.current;
    if (!el) return;
    el.style.transition = transition;
    el.style.transform = `translateX(${v}px)`;
    x.current = v;
  };

  /** Crossing the commit boundary ticks and pops the icon, both directions. */
  const setArmed = (v: boolean) => {
    if (armed.current === v) return;
    armed.current = v;
    tapHaptic();
    if (iconRef.current) iconRef.current.style.transform = v ? "scale(1.2)" : "scale(1)";
  };

  const resetArmed = () => {
    armed.current = false;
    if (iconRef.current) iconRef.current.style.transform = "scale(1)";
  };

  const closeRef = useRef<() => void>(() => {});
  closeRef.current = () => {
    openRef.current = false;
    resetArmed();
    setX(0, settleEase());
    if (closeOpenRow === myCloser.current) closeOpenRow = null;
  };
  /** Stable identity so the module-level slot can be compared and swapped. */
  const myCloser = useRef(() => closeRef.current());

  useEffect(
    () => () => {
      if (closeOpenRow === myCloser.current) closeOpenRow = null;
    },
    [],
  );

  const commit = () => {
    if (disabled || committing) {
      closeRef.current();
      return;
    }
    deleteHaptic();
    openRef.current = false;
    if (closeOpenRow === myCloser.current) closeOpenRow = null;
    const w = rowRef.current?.offsetWidth ?? 400;
    setX(-w, settleEase());
    setCommitting(true);
    void onDelete().then((ok) => {
      // Success unmounts the row via the reload; failure brings it back.
      if (!ok) {
        setCommitting(false);
        resetArmed();
        setX(0, settleEase());
      }
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || committing || !e.isPrimary) return;
    // A dangling record from a pointer that died without cancel (tab
    // switch mid-drag, lost capture) must not wedge the row; a new
    // primary pointer supersedes it.
    if (drag.current && drag.current.id !== e.pointerId) drag.current = null;
    if (drag.current) return;
    drag.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: x.current,
      claimed: false,
      moves: [{ t: performance.now(), x: x.current }],
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.claimed) {
      // Intent lock: clearly vertical movement hands the gesture to scroll.
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
        drag.current = null;
        return;
      }
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      d.claimed = true;
      try {
        contentRef.current?.setPointerCapture(e.pointerId);
      } catch {
        // capture can fail if the pointer already lifted; tracking still works
      }
      if (closeOpenRow && closeOpenRow !== myCloser.current) closeOpenRow();
    }
    const w = rowRef.current?.offsetWidth ?? 400;
    const nx = Math.min(0, Math.max(-w, d.baseX + dx));
    setX(nx, "none");
    if (Math.abs(dx) > 6) suppressClick.current = true;
    d.moves.push({ t: performance.now(), x: nx });
    if (d.moves.length > 8) d.moves.shift();
    setArmed(nx < -w * COMMIT_AT);
  };

  const onPointerEnd = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (!d.claimed) return;
    const w = rowRef.current?.offsetWidth ?? 400;
    const now = performance.now();
    const recent = d.moves.filter((m) => now - m.t <= 100);
    const first = recent[0];
    const last = recent[recent.length - 1];
    const v = first && last && last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
    if (x.current < -w * COMMIT_AT || v < -FLICK_COMMIT) {
      commit();
      return;
    }
    if (x.current < -REVEAL_W / 2 || v < -FLICK_OPEN) {
      openRef.current = true;
      resetArmed();
      setX(-REVEAL_W, settleEase());
      tapHaptic();
      closeOpenRow = myCloser.current;
      return;
    }
    closeRef.current();
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (!d.claimed) return;
    if (openRef.current) setX(-REVEAL_W, settleEase());
    else closeRef.current();
  };

  /** A drag must not fire the row's buttons; a tap on an open row closes it. */
  const onClickCapture = (e: React.MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (openRef.current) {
      e.preventDefault();
      e.stopPropagation();
      closeRef.current();
    }
  };

  return (
    <div
      className="grid transition-[grid-template-rows,opacity,margin] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
      style={{
        viewTransitionName: transitionName,
        gridTemplateRows: committing ? "0fr" : "1fr",
        opacity: committing ? 0 : 1,
        // The list's space-y gap lives on this wrapper as margin (Tailwind
        // v4 puts it on margin-bottom of non-last children); it must shrink
        // away with the height, or the eventual unmount after the reload
        // snaps everything below up by the leftover gap. Both edges zeroed
        // so the fix survives the utility changing form.
        marginTop: committing ? 0 : undefined,
        marginBottom: committing ? 0 : undefined,
      }}
    >
      <div className="overflow-hidden">
        <div ref={rowRef} className="relative">
          {/* Gesture-only affordance: Undo on the row is the accessible path. */}
          <div
            className="absolute inset-0 flex items-stretch justify-end overflow-hidden rounded-2xl bg-(--danger-strong)"
            aria-hidden="true"
          >
            <button
              tabIndex={-1}
              onClick={commit}
              className="flex w-[88px] flex-col items-center justify-center gap-0.5 text-(--danger-strong-ink)"
            >
              <span ref={iconRef} className="transition-transform duration-150 ease-out motion-reduce:transition-none">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-.8 14a2 2 0 0 1-2 1.9H7.8a2 2 0 0 1-2-1.9L5 6M10 11v6M14 11v6" />
                </svg>
              </span>
              <span className="text-[11px] font-medium">Delete</span>
            </button>
          </div>
          <div
            ref={contentRef}
            className="relative select-none"
            style={{ touchAction: "pan-y" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerCancel}
            onClickCapture={onClickCapture}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
