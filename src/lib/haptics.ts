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
