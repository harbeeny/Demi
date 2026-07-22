"use client";

import { useEffect, useState } from "react";

import { useSwipeToDismiss } from "./useSwipeToDismiss";
import { requestPushPermission } from "@/lib/push";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_PREFS,
  NotificationPrefsFields,
  type NotificationPrefs,
} from "@/components/profile/NotificationSettings";

interface Props {
  open: boolean;
  /** fired on any close; the opener records the ask so back-off holds */
  onClose: () => void;
}

/**
 * The pre-permission screen (Phase 1). Shown from the second day of briefs,
 * before the one-shot iOS modal: states the real frequency, and "Not yet"
 * costs nothing. A grant flows straight into the intensity + quiet-hours
 * step so the promise "Change it anytime" starts true.
 */
export function PushPrimer({ open, onClose }: Props) {
  const { sheetRef, scrollRef, mounted, sheetStyle, backdropStyle, handlers } =
    useSwipeToDismiss(open, onClose);
  const [step, setStep] = useState<"ask" | "prefs">("ask");
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    if (open) {
      setStep("ask");
      setBusy(false);
      setPrefs(DEFAULT_PREFS);
    }
  }, [open]);

  if (!mounted) return null;

  const turnOn = async () => {
    if (busy) return;
    setBusy(true);
    const granted = await requestPushPermission();
    setBusy(false);
    if (granted) setStep("prefs");
    else onClose(); // OS modal declined or unavailable; the app stays whole
  };

  const savePrefs = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        await supabase
          .from("profiles")
          .update({
            notification_intensity: prefs.intensity,
            quiet_hours_start: prefs.quietStart,
            quiet_hours_end: prefs.quietEnd,
          })
          .eq("id", session.user.id);
      }
    } finally {
      setBusy(false);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      style={backdropStyle}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-(--bg) shadow-[var(--shadow-sheet)]"
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
        {...handlers}
      >
        <div data-drag-handle className="shrink-0 px-5 pt-3" style={{ touchAction: "none" }}>
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-(--handle)" aria-hidden="true" />
        </div>

        <div
          ref={scrollRef}
          className="overflow-y-auto px-5 pb-[max(env(safe-area-inset-bottom),20px)]"
        >
          {step === "ask" ? (
            <>
              <h2 className="text-lg font-semibold leading-snug text-(--ink)">
                Here&apos;s how Demi checks in
              </h2>
              <p className="mt-3 text-[15px] font-medium text-(--ink)">Three a day.</p>
              <ul className="mt-2 space-y-1.5 text-[15px] leading-6 text-(--ink-2)">
                <li>Your plan in the morning.</li>
                <li>A prep reminder before dinner.</li>
                <li>A check-in at night.</li>
              </ul>
              <p className="mt-3 text-[15px] leading-6 text-(--ink-2)">
                Nothing when you&apos;re on track. Change it anytime.
              </p>
              <button
                onClick={() => void turnOn()}
                disabled={busy}
                className="press mt-5 w-full rounded-full bg-(--accent-strong) py-3.5 font-medium text-(--ink-contrast) disabled:opacity-60"
              >
                Turn on notifications
              </button>
              <button
                onClick={onClose}
                disabled={busy}
                className="press mt-1 w-full rounded-full py-3 text-(--muted) disabled:opacity-60"
              >
                Not yet
              </button>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold leading-snug text-(--ink)">
                How much should Demi say?
              </h2>
              <p className="mt-1 mb-4 text-sm leading-6 text-(--muted)">
                One choice. You can change it on your profile anytime.
              </p>
              <NotificationPrefsFields value={prefs} onChange={setPrefs} />
              <button
                onClick={() => void savePrefs()}
                disabled={busy}
                className="press mt-5 w-full rounded-full bg-(--accent-strong) py-3.5 font-medium text-(--ink-contrast) disabled:opacity-60"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
