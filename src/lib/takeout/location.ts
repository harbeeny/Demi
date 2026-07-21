import { Capacitor } from "@capacitor/core";

import { coarsen } from "./region";

/**
 * Soft pre-permission state for the takeout location ask (6.5a). The OS
 * dialog fires ONLY from the priming screen's "Use my location" button:
 * iOS denials are sticky, so a speculative ask would burn the one shot.
 * "Not now" is our own flag; the OS never hears about it and we can offer
 * again later from a quiet row instead of a re-modal.
 */
const UI_STATE_KEY = "demi:takeout:loc";

export type LocationUiState = "unset" | "later" | "denied";

export function readLocationUiState(): LocationUiState {
  try {
    const v = localStorage.getItem(UI_STATE_KEY);
    return v === "later" || v === "denied" ? v : "unset";
  } catch {
    return "unset";
  }
}

export function markLocationUiState(state: LocationUiState): void {
  try {
    if (state === "unset") localStorage.removeItem(UI_STATE_KEY);
    else localStorage.setItem(UI_STATE_KEY, state);
  } catch {
    // storage unavailable: the priming block just shows again next time
  }
}

export type PositionResult =
  | { ok: true; lat: number; lng: number }
  | { ok: false; reason: "denied" | "unavailable" };

/**
 * Ask the platform for one position fix and return it ALREADY COARSENED
 * (~1.1 km); precise coordinates never cross this module's boundary. Fires
 * the real OS permission dialog when not yet granted, so callers must only
 * invoke it from the priming flow's explicit accept.
 */
export async function requestCoarsePosition(): Promise<PositionResult> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout: 10000,
      });
      return { ok: true, ...coarsen(pos.coords.latitude, pos.coords.longitude) };
    } catch (e) {
      const msg = e instanceof Error ? e.message.toLowerCase() : "";
      const denied = msg.includes("denied") || msg.includes("permission");
      return { ok: false, reason: denied ? "denied" : "unavailable" };
    }
  }
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { ok: false, reason: "unavailable" };
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ ok: true, ...coarsen(pos.coords.latitude, pos.coords.longitude) }),
      (err) =>
        resolve({
          ok: false,
          reason: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable",
        }),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  });
}
