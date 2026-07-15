"use client";

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
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[#e3e8de]/60 bg-[#fbfcfa] backdrop-blur-xl supports-[backdrop-filter]:bg-[#fbfcfa]/75"
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
                active ? "font-semibold text-[#2c3a2e]" : "text-[#829084]"
              }`}
            >
              <span
                aria-hidden
                className={`grid h-6 w-10 place-items-center rounded-full text-sm ${
                  active ? "bg-[#d3e29f]" : ""
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
