"use client";

import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { device24HourClock, formatTimeHour } from "@/lib/dates";
import type { NotificationIntensity } from "@/lib/supabase/types";

export interface NotificationPrefs {
  intensity: NotificationIntensity;
  quietStart: number;
  quietEnd: number;
}

/** Spec defaults: coach voice, quiet 21:30 to 07:00. */
export const DEFAULT_PREFS: NotificationPrefs = {
  intensity: "coach",
  quietStart: 21.5,
  quietEnd: 7,
};

const INTENSITY_OPTIONS: Array<{
  value: NotificationIntensity;
  label: string;
  perDay: string;
  detail: string;
}> = [
  { value: "coach", label: "Coach", perDay: "3-4 a day", detail: "The full rhythm: plan, prep reminders, check-ins" },
  { value: "checkin", label: "Check-in", perDay: "2 a day", detail: "Morning brief and evening close only" },
  { value: "quiet", label: "Quiet", perDay: "1 a day", detail: "Morning brief only" },
];

/** Half-hour steps across the day for the quiet-hours selects. */
const HALF_HOURS = Array.from({ length: 48 }, (_, i) => i / 2);

/**
 * One choice, three options, plus the quiet-hours range. Shared between the
 * post-permission step of the push primer and the Profile page; deliberately
 * NOT a per-notification toggle list (that is a funnel to "all off" - the
 * per-slot kill lives on the notification itself).
 */
export function NotificationPrefsFields({
  value,
  onChange,
}: {
  value: NotificationPrefs;
  onChange: (next: NotificationPrefs) => void;
}) {
  const prefers24h = device24HourClock();
  const timeLabel = (h: number) => formatTimeHour(h, prefers24h);

  return (
    <div>
      <div role="radiogroup" aria-label="Notification intensity" className="space-y-2">
        {INTENSITY_OPTIONS.map((opt) => {
          const selected = value.intensity === opt.value;
          return (
            <button
              key={opt.value}
              role="radio"
              aria-checked={selected}
              onClick={() => onChange({ ...value, intensity: opt.value })}
              className={`press w-full rounded-2xl border p-3.5 text-left transition-colors duration-150 ${
                selected
                  ? "border-(--accent-strong) bg-(--surface-2)"
                  : "border-(--border) bg-(--surface)"
              }`}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-(--ink)">{opt.label}</span>
                <span className={`text-xs ${selected ? "text-(--accent-text)" : "text-(--muted)"}`}>
                  {opt.perDay}
                </span>
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-(--ink-2)">{opt.detail}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        <span className="text-sm font-medium text-(--ink)">Quiet hours</span>
        <p className="mt-0.5 text-xs leading-5 text-(--muted)">Nothing arrives between these times.</p>
        <div className="mt-2 flex items-center gap-2">
          {(["quietStart", "quietEnd"] as const).map((field, i) => (
            <label key={field} className="flex-1">
              <span className="sr-only">{i === 0 ? "Quiet hours start" : "Quiet hours end"}</span>
              <select
                value={value[field]}
                onChange={(e) => onChange({ ...value, [field]: Number(e.target.value) })}
                className="w-full appearance-none rounded-2xl border border-(--border) bg-(--surface) px-3 py-2.5 text-center text-base text-(--ink)"
              >
                {HALF_HOURS.map((h) => (
                  <option key={h} value={h}>
                    {timeLabel(h)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Profile-page section: loads the saved preferences, saves on change
 * ("Change it anytime" is a promise the primer copy makes).
 */
export function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [savedTick, setSavedTick] = useState(false);
  const tickTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user || cancelled) return;
      const { data } = await supabase
        .from("profiles")
        .select("notification_intensity, quiet_hours_start, quiet_hours_end")
        .eq("id", session.user.id)
        .maybeSingle();
      if (cancelled) return;
      setPrefs({
        intensity: data?.notification_intensity ?? DEFAULT_PREFS.intensity,
        quietStart: data?.quiet_hours_start ?? DEFAULT_PREFS.quietStart,
        quietEnd: data?.quiet_hours_end ?? DEFAULT_PREFS.quietEnd,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (next: NotificationPrefs) => {
    setPrefs(next);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) return;
    await supabase
      .from("profiles")
      .update({
        notification_intensity: next.intensity,
        quiet_hours_start: next.quietStart,
        quiet_hours_end: next.quietEnd,
      })
      .eq("id", session.user.id);
    setSavedTick(true);
    if (tickTimer.current) window.clearTimeout(tickTimer.current);
    tickTimer.current = window.setTimeout(() => setSavedTick(false), 1400);
  };

  if (!prefs) return null;

  return (
    <section className="mt-4 rounded-3xl bg-(--surface) p-5 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-(--ink)">Notifications</h2>
        <span
          aria-live="polite"
          className={`text-xs text-(--accent-text) transition-opacity duration-200 ${
            savedTick ? "opacity-100" : "opacity-0"
          }`}
        >
          Saved
        </span>
      </div>
      <NotificationPrefsFields value={prefs} onChange={(next) => void save(next)} />
    </section>
  );
}
