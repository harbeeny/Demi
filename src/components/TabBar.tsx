"use client";

import { useEffect, useState } from "react";
import { watchSystemTheme } from "@/lib/theme";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { AddSheet, type AddAction } from "./AddSheet";

type TabName = "today" | "progress" | "profile";

const TABS: ReadonlyArray<{ href: string; label: string; name: TabName }> = [
  { href: "/today", label: "Today", name: "today" },
  { href: "/progress", label: "Progress", name: "progress" },
  { href: "/profile", label: "Profile", name: "profile" },
];

/** Outline glyph normally, solid when the tab is current (the Family read:
 *  no labels, no pills, the fill IS the active state). */
function TabIcon({ name, active }: { name: TabName; active: boolean }) {
  const line = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" } as const;
  const shape = active
    ? { fill: "currentColor", stroke: "none" }
    : { fill: "none", ...line, strokeLinejoin: "round" as const };

  switch (name) {
    case "today":
      return (
        <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r={active ? 5 : 4.6} {...shape} />
          <g {...line} strokeWidth={active ? 2 : 1.8} fill="none">
            <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
          </g>
        </svg>
      );
    case "progress":
      return (
        <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4.2" y="12.5" width="3.6" height="7" rx="1.6" {...shape} />
          <rect x="10.2" y="8.5" width="3.6" height="11" rx="1.6" {...shape} />
          <rect x="16.2" y="4.5" width="3.6" height="15" rx="1.6" {...shape} />
        </svg>
      );
    case "profile":
      return (
        <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8.2" r="3.6" {...shape} />
          <path d="M4.8 19.5c.9-3.9 3.9-5.9 7.2-5.9s6.3 2 7.2 5.9c-2.2 1-4.7 1.5-7.2 1.5s-5-.5-7.2-1.5Z" {...shape} />
        </svg>
      );
  }
}

/** Instagram-style scroll response for the floating cluster: shrink while
 *  the page scrolls down, expand the moment it scrolls up or rests near the
 *  top. Direction flips only after 8px of accumulated travel so micro-jitter
 *  never toggles it, and y is clamped to the scrollable range so iOS
 *  rubber-banding can't fake a direction change. The handler runs straight
 *  off the event (no rAF batching: hidden pages freeze rAF, which would wedge
 *  a pending frame and eat every later event); the work is a few reads and a
 *  same-value setState that React bails on. Reduced motion opts out here, in
 *  JS, because the scale-* utilities set the CSS `scale` property, which
 *  motion-reduce:transform-none does not touch. */
function useShrunkOnScroll() {
  const [shrunk, setShrunk] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let lastY = Math.max(window.scrollY, 0);
    const onScroll = () => {
      const maxY = Math.max(
        document.documentElement.scrollHeight - window.innerHeight,
        0,
      );
      const y = Math.min(Math.max(window.scrollY, 0), maxY);
      if (Math.abs(y - lastY) < 8) return;
      setShrunk(y > lastY && y > 48);
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return shrunk;
}

/**
 * Floating pill tab bar with the + beside it, one detached cluster above the
 * home indicator (the Instagram read: content scrolls behind it, and the
 * whole cluster scales down while scrolling down, back up while scrolling
 * up). Kitchen is a feature behind +, not a tab: + opens the action sheet
 * everywhere, and rows either navigate (kitchen) or hand an intent to the
 * Today screen (log, scan) via a demi:add event when it's already mounted
 * or ?add= when it isn't.
 */
export function TabBar() {
  // Status bar follows the on-screen theme, including OS flips in system mode.
  useEffect(() => watchSystemTheme(), []);

  const pathname = usePathname();
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const shrunk = useShrunkOnScroll();

  // A camera row's dismissed capture asks to come back here (see TodayView's
  // onAutoCancel): reopen the sheet so cancel returns where the user was.
  useEffect(() => {
    const reopen = () => setAddOpen(true);
    window.addEventListener("demi:add-reopen", reopen);
    return () => window.removeEventListener("demi:add-reopen", reopen);
  }, []);

  const act = (action: AddAction) => {
    setAddOpen(false);
    if (action === "kitchen") {
      router.push("/kitchen");
      return;
    }
    if (pathname.startsWith("/today")) {
      window.dispatchEvent(new CustomEvent("demi:add", { detail: action }));
    } else {
      router.push(`/today?add=${action}`);
    }
  };

  return (
    <>
      {/* One transform scales pill + FAB together from the bottom edge, so
          the cluster settles toward the home indicator instead of floating
          off it. Transform-only and interruptible (CSS transition), on the
          app easing; reduced motion pins it at full size. The wrapper spans
          the viewport for centering, so it must not eat taps beside the
          cluster. */}
      <div
        className={`pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-30 flex origin-bottom items-center justify-center gap-3 transition-transform duration-200 ease-(--ease-out) motion-reduce:transition-none ${
          shrunk ? "scale-[0.82]" : ""
        }`}
      >
        <nav
          aria-label="Main"
          className="pointer-events-auto flex items-center rounded-full border border-(--border)/70 bg-(--surface-2) px-2 py-1.5 shadow-[0_10px_30px_rgba(22,32,26,0.18)] backdrop-blur-xl supports-[backdrop-filter]:bg-(--surface-2)/75"
        >
          {TABS.map((t) => {
            const active = pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-label={t.label}
                aria-current={active ? "page" : undefined}
                className={`press flex h-11 w-14 items-center justify-center rounded-full ${
                  active ? "text-(--ink)" : "text-(--muted)"
                }`}
              >
                <TabIcon name={t.name} active={active} />
              </Link>
            );
          })}
        </nav>

        {/* Floating add action beside the pill, wallet-app FAB energy; the
            sheet's z-40 backdrop covers it while open. */}
        <button
          onClick={() => setAddOpen(true)}
          aria-label="Add"
          aria-haspopup="dialog"
          aria-expanded={addOpen}
          className="press pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-(--ink) text-(--ink-contrast) shadow-[0_8px_24px_rgba(22,32,26,0.35)]"
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
      <AddSheet open={addOpen} onClose={() => setAddOpen(false)} onAction={act} />
    </>
  );
}
