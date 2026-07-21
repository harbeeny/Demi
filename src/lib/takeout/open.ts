import { Capacitor } from "@capacitor/core";

import type { TakeoutProvider } from "@/lib/supabase/types";
import { buildTakeoutSearchUrl, PROVIDER_HOMEPAGES } from "./deeplinks";

/**
 * Open the provider's search for a dish, preferring the native app. On iOS,
 * AppLauncher routes the https universal link through UIApplication.open,
 * which hands off to the installed DoorDash / Uber Eats app directly and
 * falls back to Safari otherwise; window.open would navigate the WKWebView
 * itself and replace the app UI. On the web it's a new tab. The search URL
 * shapes are unversioned upstream, so a failed open retries the provider's
 * homepage rather than dying on a dead tap.
 */
export async function openTakeoutSearch(
  provider: TakeoutProvider,
  dishQuery: string,
  geo?: { lat: number; lng: number },
): Promise<void> {
  if (!(await openExternal(buildTakeoutSearchUrl(provider, dishQuery, geo)))) {
    await openExternal(PROVIDER_HOMEPAGES[provider]);
  }
}

async function openExternal(url: string): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    // Lazily imported like haptics so the plugin stays off the web path.
    try {
      const { AppLauncher } = await import("@capacitor/app-launcher");
      await AppLauncher.openUrl({ url });
      return true;
    } catch {
      // plugin missing or launch refused; the web path below still works
    }
  }
  try {
    return window.open(url, "_blank", "noopener") !== null;
  } catch {
    return false;
  }
}
