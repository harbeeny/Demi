"use client";

import { useEffect, useState } from "react";

import { applyThemeChoice, getThemeChoice, type ThemeChoice } from "@/lib/theme";
import { tapHaptic } from "@/lib/haptics";

/**
 * Icon-only theme switcher pill: light, dark, then system. Sits quietly at
 * the top of Profile and onboarding. Icon-only keeps it discrete; aria
 * labels carry the names. State syncs from storage after mount because both
 * host pages prerender without a theme attribute.
 */

const ICON = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const CHOICES: Array<{ value: ThemeChoice; label: string; icon: React.ReactNode }> = [
  {
    value: "light",
    label: "Light",
    icon: (
      <svg {...ICON}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: (
      <svg {...ICON}>
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
    ),
  },
  {
    value: "system",
    label: "System",
    icon: (
      <svg {...ICON}>
        <rect width="14" height="20" x="5" y="2" rx="2" />
        <path d="M12 18h.01" />
      </svg>
    ),
  },
];

export function ThemePill({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<ThemeChoice>("system");
  useEffect(() => {
    setTheme(getThemeChoice());
  }, []);

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={`inline-flex rounded-full border border-(--border) bg-(--surface) p-0.5 ${className}`}
    >
      {CHOICES.map(({ value, label, icon }) => (
        <button
          key={value}
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          onClick={() => {
            tapHaptic();
            setTheme(value);
            applyThemeChoice(value);
          }}
          className={`press flex h-9 w-10 items-center justify-center rounded-full ${
            theme === value
              ? "bg-(--ink) text-(--ink-contrast)"
              : "text-(--muted) hover:text-(--ink-2)"
          }`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
