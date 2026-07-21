"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { readSnapshot, writeSnapshot } from "@/lib/tab-cache";
import { apiFetch } from "@/lib/api";
import { targets } from "@/lib/nutrition";
import { profileFromRow } from "@/lib/plan/rows";
import { kgToLbs, lbsToKg } from "@/lib/units";
import { localDateISO } from "@/lib/dates";
import { WheelPicker } from "@/components/onboarding/WheelPicker";
import { TabBar } from "@/components/TabBar";
import { WeightChart } from "@/components/progress/WeightChart";
import { IntakeChart } from "@/components/progress/IntakeChart";
import { AdaptCard, type AdjustState } from "@/components/progress/AdaptCard";

/** 80-400 lbs, 1 lb steps; same range the onboarding wheel uses. */
const WEIGHT_OPTIONS = Array.from({ length: 321 }, (_, i) => i + 80);

interface WeighIn {
  date: string;
  weightKg: number;
}

/** Everything the screen shows, cached for instant repaint on revisit. */
interface ProgressSnapshot {
  weighIns: WeighIn[];
  intakeDays: Array<{ date: string; totalKcal: number }>;
  targetKcal: number;
  adjust: AdjustState | null;
  savedToday: boolean;
  wheelLbs: number;
}

export default function ProgressPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [weighIns, setWeighIns] = useState<WeighIn[]>([]);
  const [intakeDays, setIntakeDays] = useState<Array<{ date: string; totalKcal: number }>>([]);
  const [targetKcal, setTargetKcal] = useState(0);
  const [adjust, setAdjust] = useState<AdjustState | null>(null);
  const [accepted, setAccepted] = useState<{ newKcal: number; explanation: string } | null>(null);
  const [wheelLbs, setWheelLbs] = useState(165);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedToday, setSavedToday] = useState(false);

  const reload = useCallback(async () => {
    const supabase = createClient();
    const apply = (s: ProgressSnapshot) => {
      setWeighIns(s.weighIns);
      setIntakeDays(s.intakeDays);
      setTargetKcal(s.targetKcal);
      if (s.adjust) setAdjust(s.adjust);
      setSavedToday(s.savedToday);
      setWheelLbs(s.wheelLbs);
      setLoading(false);
    };

    // Local session read, not the getUser network round trip: the gate only
    // routes; the API routes verify the token on every real request.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      router.replace("/login");
      return;
    }

    // Stale-while-revalidate: paint the last snapshot immediately; the
    // fresh fetch below replaces it silently.
    const snapKey = `progress:${user.id}`;
    const snap = readSnapshot<ProgressSnapshot>(snapKey);
    if (snap) apply(snap);

    // One round trip: onboarding, intake days, and both API calls together
    // (un-onboarded visitors just redirect after).
    const since = localDateISO(null, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const [{ data: onboarding }, { data: logDays }, weightRes, adjustRes] = await Promise.all([
      supabase
        .from("onboarding_answers")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single(),
      supabase
        .from("daily_logs")
        .select("date, total_kcal")
        .eq("user_id", user.id)
        .gte("date", since)
        .order("date", { ascending: true }),
      apiFetch("/api/weight?days=90"),
      apiFetch("/api/adjust"),
    ]);
    if (!onboarding) {
      router.replace("/onboarding");
      return;
    }

    const weightData = (await weightRes.json().catch(() => ({}))) as { weighIns?: WeighIn[] };
    const adjustData = (await adjustRes.json().catch(() => null)) as AdjustState | null;

    const rows = weightData.weighIns ?? [];
    const today = localDateISO();
    const latest = rows[rows.length - 1];
    const fresh: ProgressSnapshot = {
      weighIns: rows,
      intakeDays: (logDays ?? []).map((d) => ({ date: d.date, totalKcal: Number(d.total_kcal) })),
      targetKcal: targets(profileFromRow(onboarding), { displayUnits: "us" }).kcal.value,
      adjust: adjustRes.ok && adjustData ? adjustData : null,
      savedToday: latest?.date === today,
      wheelLbs: Math.round(kgToLbs(latest?.weightKg ?? Number(onboarding.weight_kg))),
    };
    writeSnapshot(snapKey, fresh);
    apply(fresh);
  }, [router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function saveWeight() {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/weight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ weightKg: lbsToKg(wheelLbs) }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Couldn't save your check-in.");
      } else {
        await reload();
      }
    } catch {
      setError("Network hiccup. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resolveProposal(id: string, action: "accept" | "dismiss") {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/adjust", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        newKcal?: number;
        tdeeCorrection?: { reasoning?: { explanation?: string } } | null;
      };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        await reload();
      } else if (action === "accept" && data.newKcal) {
        setAccepted({
          newKcal: data.newKcal,
          explanation: data.tdeeCorrection?.reasoning?.explanation ?? "",
        });
        await reload();
      } else {
        await reload();
      }
    } catch {
      setError("Network hiccup. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto w-full flex min-h-dvh max-w-md items-center justify-center bg-(--bg)">
        <p className="animate-pulse text-(--ink)">Loading your progress...</p>
        <TabBar />
      </main>
    );
  }

  const safetyGated = adjust?.insufficientData.includes("safety_maintenance_active") ?? false;

  return (
    <main className="mx-auto w-full min-h-dvh max-w-md bg-(--bg) px-5 pb-28 pt-8">
      <header className="mb-6 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-(--accent-tint) font-semibold text-(--ink)">D</span>
        <h1 className="text-lg font-semibold leading-tight text-(--ink)">Progress</h1>
      </header>

      {error && <p className="mb-4 rounded-2xl bg-(--danger-bg) p-3 text-sm text-(--danger-ink)">{error}</p>}

      <section className="mb-4 rounded-3xl bg-(--surface) p-5 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-(--ink)">Weigh in</h2>
        <div className="rounded-2xl bg-(--surface-2) py-3">
          <WheelPicker
            key="checkin"
            values={WEIGHT_OPTIONS}
            value={wheelLbs}
            onChange={setWheelLbs}
            label="lbs"
            ariaLabel="Weight in pounds"
            orientation="horizontal"
          />
        </div>
        <button
          onClick={saveWeight}
          disabled={busy}
          className="press mt-3 w-full rounded-2xl bg-(--ink) px-5 py-3 font-medium text-(--ink-contrast) disabled:opacity-60"
        >
          {busy ? "Saving..." : savedToday ? "Update today's weigh-in" : "Log today's weight"}
        </button>
      </section>

      <section className="mb-4 rounded-3xl bg-(--surface) p-5 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-(--ink)">Weight trend</h2>
        <WeightChart weighIns={weighIns} />
      </section>

      <section className="mb-4 rounded-3xl bg-(--surface) p-5 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-(--ink)">Intake vs target</h2>
        <IntakeChart days={intakeDays} targetKcal={targetKcal} />
      </section>

      {!safetyGated && adjust && (
        <AdaptCard state={adjust} busy={busy} onResolve={resolveProposal} accepted={accepted} />
      )}

      <p className="mt-8 text-center text-xs leading-5 text-(--muted)">
        Demi offers general wellness guidance, not medical advice.
      </p>

      <TabBar />
    </main>
  );
}
