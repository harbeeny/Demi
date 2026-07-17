"use client";

import { Capacitor } from "@capacitor/core";

/**
 * Theme choice: light, dark, or follow the system. The choice lives in
 * localStorage (device-level, like demi:mode) and applies as a data-theme
 * attribute on <html>; "system" removes the attribute so the CSS
 * prefers-color-scheme media query decides. layout.tsx runs the same read
 * before first paint, so a pinned theme never flashes.
 */

export type ThemeChoice = "light" | "dark" | "system";

const KEY = "demi:theme";

export function getThemeChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

/** The theme actually on screen right now, after resolving "system". */
export function resolvedTheme(choice: ThemeChoice = getThemeChoice()): "light" | "dark" {
  if (choice === "system") return systemPrefersDark() ? "dark" : "light";
  return choice;
}

/** iOS status bar text must flip with the surface behind it. */
function syncStatusBar(active: "light" | "dark"): void {
  if (!Capacitor.isNativePlatform()) return;
  void (async () => {
    try {
      const { StatusBar, Style } = await import("@capacitor/status-bar");
      // Style.Dark = light text (for dark surfaces), Style.Light = dark text.
      await StatusBar.setStyle({ style: active === "dark" ? Style.Dark : Style.Light });
    } catch {
      // plugin unavailable (web/tests); the theme itself still applies
    }
  })();
}

export function applyThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // storage unavailable: still apply for this page's lifetime
  }
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  syncStatusBar(resolvedTheme(choice));
}

/**
 * Keep the status bar honest while in system mode: when the OS flips,
 * the CSS updates by itself but the native bar needs a nudge. Returns an
 * unsubscribe function.
 */
export function watchSystemTheme(): () => void {
  try {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (getThemeChoice() === "system") syncStatusBar(mq.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    // Align the bar with whatever is on screen at start.
    syncStatusBar(resolvedTheme());
    return () => mq.removeEventListener("change", onChange);
  } catch {
    return () => undefined;
  }
}
