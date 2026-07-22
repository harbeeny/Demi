import { Capacitor } from "@capacitor/core";

/**
 * Light impact haptic for meaningful taps. Fire-and-forget: native-only,
 * lazily imported so the plugin stays out of the web-critical path, and any
 * failure is silently ignored (feedback must never break the action).
 */
export function tapHaptic(): void {
  if (!Capacitor.isNativePlatform()) return;
  void (async () => {
    try {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      // haptics unavailable (old device, permission edge); the tap still works
    }
  })();
}

/**
 * Medium impact for destructive commits (swipe-to-delete). Heavier than
 * tapHaptic so removing something reads differently from selecting it.
 */
export function deleteHaptic(): void {
  if (!Capacitor.isNativePlatform()) return;
  void (async () => {
    try {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch {
      // haptics unavailable; the row still slides away
    }
  })();
}

/** Success notification haptic for a completed action (e.g. food logged). */
export function successHaptic(): void {
  if (!Capacitor.isNativePlatform()) return;
  void (async () => {
    try {
      const { Haptics, NotificationType } = await import("@capacitor/haptics");
      await Haptics.notification({ type: NotificationType.Success });
    } catch {
      // haptics unavailable; the confirmation animation still shows
    }
  })();
}

/**
 * Double success buzz for the day's big moment (calorie goal reached).
 * Deliberately bigger than successHaptic so the two read as different
 * events when they fire back to back.
 */
export function goalHaptic(): void {
  if (!Capacitor.isNativePlatform()) return;
  void (async () => {
    try {
      const { Haptics, NotificationType } = await import("@capacitor/haptics");
      await Haptics.notification({ type: NotificationType.Success });
      await new Promise((r) => setTimeout(r, 180));
      await Haptics.notification({ type: NotificationType.Success });
    } catch {
      // haptics unavailable; the badge pop still shows
    }
  })();
}
