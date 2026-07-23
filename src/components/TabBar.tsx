"use client";

import { useEffect, useState } from "react";
import { watchSystemTheme } from "@/lib/theme";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { AddSheet, type AddAction } from "./AddSheet";

const TABS = [
  { href: "/today", label: "Today", icon: "☀︎" },
  { href: "/progress", label: "Progress", icon: "◔" },
  { href: "/profile", label: "Profile", icon: "◍" },
] as const;

/**
 * Bottom tab bar plus the centered + button. Kitchen is a feature behind +,
 * not a tab: + opens the action sheet everywhere, and rows either navigate
 * (kitchen) or hand an intent to the Today screen (log, scan) via a
 * demi:add event when it's already mounted or ?add= when it isn't.
 */
export function TabBar() {
  // Status bar follows the on-screen theme, including OS flips in system mode.
  useEffect(() => watchSystemTheme(), []);

  const pathname = usePathname();
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);

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

  const tab = (t: (typeof TABS)[number]) => {
    const active = pathname.startsWith(t.href);
    return (
      <Link
        key={t.href}
        href={t.href}
        aria-current={active ? "page" : undefined}
        className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs ${
          active ? "font-semibold text-(--ink)" : "text-(--muted)"
        }`}
      >
        <span
          aria-hidden
          className={`grid h-6 w-10 place-items-center rounded-full text-sm ${
            active ? "bg-(--accent-tint)" : ""
          }`}
        >
          {t.icon}
        </span>
        {t.label}
      </Link>
    );
  };

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-(--border)/60 bg-(--surface-2) backdrop-blur-xl supports-[backdrop-filter]:bg-(--surface-2)/75"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Main"
      >
        <div className="mx-auto flex max-w-md items-stretch">
          {tab(TABS[0])}
          <div className="flex flex-1 items-center justify-center">
            <button
              onClick={() => setAddOpen(true)}
              aria-label="Add"
              aria-haspopup="dialog"
              aria-expanded={addOpen}
              className="press flex h-11 w-11 items-center justify-center rounded-full bg-(--ink) text-(--ink-contrast) shadow-[0_4px_14px_rgba(22,32,26,0.25)]"
            >
              <svg
                width="22"
                height="22"
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
          {tab(TABS[1])}
          {tab(TABS[2])}
        </div>
      </nav>
      <AddSheet open={addOpen} onClose={() => setAddOpen(false)} onAction={act} />
    </>
  );
}
