"use client";

import { useState } from "react";

import { applyThemeChoice, getThemeChoice, type ThemeChoice } from "@/lib/theme";
import { tapHaptic } from "@/lib/haptics";

/**
 * Theme choice UI, shared between the Profile pill and the onboarding
 * appearance step: light, dark, then system. Icon-only in the pill keeps
 * it discrete; aria labels carry the names.
 */

export const THEME_CHOICES: Array<{ value: ThemeChoice; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function ThemeIcon({ choice, size = 16 }: { choice: ThemeChoice; size?: number }) {
  const p = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  } as const;
  if (choice === "light") {
    return (
      <svg {...p}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
    );
  }
  if (choice === "dark") {
    return (
      <svg {...p}>
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
    );
  }
  return (
    <svg {...p}>
      <rect width="14" height="20" x="5" y="2" rx="2" />
      <path d="M12 18h.01" />
    </svg>
  );
}

export function ThemePill({ className = "" }: { className?: string }) {
  // Lazy read, not a mount effect: the pill only mounts client-side (behind
  // Profile's loading gate), and an effect-sync would flash the default for
  // a frame now that tabs paint instantly from snapshots.
  const [theme, setTheme] = useState<ThemeChoice>(getThemeChoice);

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={`inline-flex rounded-full border border-(--border) bg-(--surface) p-0.5 ${className}`}
    >
      {THEME_CHOICES.map(({ value, label }) => (
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
          <ThemeIcon choice={value} />
        </button>
      ))}
    </div>
  );
}
