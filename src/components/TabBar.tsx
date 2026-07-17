"use client";

import { useEffect } from "react";
import { watchSystemTheme } from "@/lib/theme";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/today", label: "Today", icon: "☀︎" },
  { href: "/kitchen", label: "Kitchen", icon: "⊞" },
  { href: "/progress", label: "Progress", icon: "◔" },
  { href: "/profile", label: "Profile", icon: "◍" },
] as const;

/** Bottom tab bar for the three app screens. Safe-area aware for the shell. */
export function TabBar() {
  // Status bar follows the on-screen theme, including OS flips in system mode.
  useEffect(() => watchSystemTheme(), []);

  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-(--border)/60 bg-(--surface-2) backdrop-blur-xl supports-[backdrop-filter]:bg-(--surface-2)/75"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Main"
    >
      <div className="mx-auto flex max-w-md">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
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
                {tab.icon}
              </span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
