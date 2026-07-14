"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";

import { createClient } from "@/lib/supabase/client";

/**
 * Invisible helper on the marketing landing page. The native app should open
 * into the product, not the pitch; signed-in web visitors likewise (the
 * middleware also does this server-side on the web, this covers the shell
 * where no middleware runs).
 */
export function AppRedirect() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (Capacitor.isNativePlatform()) {
        router.replace("/today");
        return;
      }
      const {
        data: { session },
      } = await createClient().auth.getSession();
      if (!cancelled && session) router.replace("/today");
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
