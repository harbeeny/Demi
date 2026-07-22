"use client";

/**
 * Same-document View Transition wrapper: the browser snapshots the page,
 * applies the update, and morphs between the two states (elements sharing
 * a view-transition-name travel and resize; the rest crossfades). Feature
 * gated and skipped under reduced motion, where the update lands instantly,
 * which is exactly the pre-transition behavior.
 */
export async function withViewTransition(apply: () => void): Promise<void> {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> };
  };
  let reduce = false;
  try {
    reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    // matchMedia unavailable: treat as no preference
  }
  if (!doc.startViewTransition || reduce) {
    apply();
    return;
  }
  try {
    await doc.startViewTransition(apply).finished;
  } catch {
    // aborted (duplicate names, rapid successive updates): the state change
    // itself still applied; only the animation was skipped
  }
}
