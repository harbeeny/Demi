import { Capacitor } from "@capacitor/core";
import type { PushNotificationsPlugin } from "@capacitor/push-notifications";

import { createClient } from "@/lib/supabase/client";

let listenersAttached = false;

/**
 * Which APNs environment this build's tokens live in. Baked at export
 * time: dev builds default to development (sandbox APNs); the TestFlight
 * and App Store archive sets NEXT_PUBLIC_APNS_ENV=production (MOBILE.md).
 * A mismatched flag strands push for the install, so the archive recipe
 * owns this value, never hands.
 */
const APNS_ENVIRONMENT =
  process.env.NEXT_PUBLIC_APNS_ENV === "production" ? "production" : "development";

/** Mirror of the sender's kindFamily: slot-N kinds are one family. */
function kindFamily(kind: string): string {
  return kind.startsWith("slot-") ? "meal-reminder" : kind;
}

/**
 * Listeners must be attached before register() or a fast callback is lost.
 * Shared by the silent re-registration path and the explicit request flow.
 */
async function attachListeners(push: PushNotificationsPlugin): Promise<void> {
  if (listenersAttached) return;
  listenersAttached = true;

  await push.addListener("registration", async ({ value: token }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("device_tokens").upsert(
      {
        user_id: user.id,
        token,
        platform: "ios",
        environment: APNS_ENVIRONMENT,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "token" },
    );
  });

  // Interacting with a push is the outcome the notification decision log is
  // waiting on: match the sender's payload keys back to the day's event row.
  // RLS plus a column grant limit these writes to outcome/action on own rows.
  await push.addListener("pushNotificationActionPerformed", async ({ actionId, notification }) => {
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

    if (actionId === "STOP_THIS") {
      // The permanent per-slot kill switch: one insert, no confirmation,
      // no re-ask. ignoreDuplicates keeps a double-tap a no-op (the table
      // has no update grant).
      await supabase.from("notification_kills").upsert(
        { user_id: session.user.id, family: kindFamily(kind) },
        { onConflict: "user_id,family", ignoreDuplicates: true },
      );
      await supabase
        .from("notification_events")
        .update({ outcome: "action_taken", action: "stop-slot" })
        .eq("user_id", session.user.id)
        .eq("date", date!)
        .eq("kind", kind)
        .eq("outcome", "pending");
      return;
    }

    await supabase
      .from("notification_events")
      .update({ outcome: "opened" })
      .eq("user_id", session.user.id)
      .eq("date", date!)
      .eq("kind", kind)
      .eq("outcome", "pending");
  });
}

/**
 * Keep an already-permitted device registered: sync the APNs token and
 * attach listeners. Never prompts; the pre-permission flow owns the ask.
 * No-op on the web; the plugin is dynamically imported so it never enters
 * the web bundle. Safe to call on every Today mount (token upserts are
 * idempotent; APNs rotates tokens occasionally, which the upsert absorbs).
 */
export async function ensurePushRegistered(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    if ((await PushNotifications.checkPermissions()).receive !== "granted") return;
    await attachListeners(PushNotifications);
    await PushNotifications.register();
  } catch (err) {
    // Push is an enhancement; never let it break the Today screen.
    console.error("ensurePushRegistered failed:", err);
  }
}

export type PushPermission = "granted" | "denied" | "prompt";

/** Current OS-level state, so the primer knows whether asking is possible. */
export async function pushPermissionStatus(): Promise<PushPermission | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const status = (await PushNotifications.checkPermissions()).receive;
    if (status === "granted") return "granted";
    if (status === "denied") return "denied";
    return "prompt";
  } catch {
    return null;
  }
}

/**
 * Fire the one-shot iOS system modal. Called ONLY from the pre-permission
 * screen after the user tapped "Turn on notifications"; iOS allows this
 * exactly once per install, which is why the primer gates it.
 */
export async function requestPushPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    let status = (await PushNotifications.checkPermissions()).receive;
    if (status === "prompt" || status === "prompt-with-rationale") {
      status = (await PushNotifications.requestPermissions()).receive;
    }
    if (status !== "granted") return false;
    await attachListeners(PushNotifications);
    await PushNotifications.register();
    return true;
  } catch (err) {
    console.error("requestPushPermission failed:", err);
    return false;
  }
}
