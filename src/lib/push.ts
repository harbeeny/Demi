import { Capacitor } from "@capacitor/core";

import { createClient } from "@/lib/supabase/client";

let started = false;

/**
 * Register this device for APNs push and store the token. No-op on the web;
 * the plugin is dynamically imported so it never enters the web bundle.
 * Safe to call on every Today mount: guarded, and token upserts are
 * idempotent (APNs rotates tokens occasionally, which the upsert absorbs).
 */
export async function registerPush(): Promise<void> {
  if (!Capacitor.isNativePlatform() || started) return;
  started = true;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    let status = (await PushNotifications.checkPermissions()).receive;
    if (status === "prompt" || status === "prompt-with-rationale") {
      status = (await PushNotifications.requestPermissions()).receive;
    }
    if (status !== "granted") return;

    // Listener must be attached before register() or a fast callback is lost.
    await PushNotifications.addListener("registration", async ({ value: token }) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("device_tokens").upsert(
        { user_id: user.id, token, platform: "ios", updated_at: new Date().toISOString() },
        { onConflict: "token" },
      );
    });

    // Tapping a push is the outcome the notification decision log is waiting
    // on: match the sender's payload keys back to the day's event row. RLS
    // plus a column grant limit this write to outcome/action on own rows.
    await PushNotifications.addListener("pushNotificationActionPerformed", async ({ notification }) => {
      const demi = (notification.data as { demi?: { kind?: unknown; date?: unknown } } | undefined)
        ?.demi;
      const kind = typeof demi?.kind === "string" ? demi.kind : null;
      const date = typeof demi?.date === "string" ? demi.date : null;
      if (!kind || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) return;
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;
      await supabase
        .from("notification_events")
        .update({ outcome: "opened" })
        .eq("user_id", session.user.id)
        .eq("date", date!)
        .eq("kind", kind)
        .eq("outcome", "pending");
    });

    await PushNotifications.register();
  } catch (err) {
    // Push is an enhancement; never let it break the Today screen.
    console.error("registerPush failed:", err);
  }
}
