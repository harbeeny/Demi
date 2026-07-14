"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import { targets } from "@/lib/nutrition";
import { profileFromRow } from "@/lib/plan/rows";
import { kgToLbs, lbsToKg } from "@/lib/units";
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/login");
      return;
    }

    const { data: onboarding } = await supabase
      .from("onboarding_answers")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (!onboarding) {
      router.replace("/onboarding");
      return;
    }

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const [{ data: logDays }, weightRes, adjustRes] = await Promise.all([
      supabase
        .from("daily_logs")
        .select("date, total_kcal")
        .eq("user_id", user.id)
        .gte("date", since)
        .order("date", { ascending: true }),
      apiFetch("/api/weight?days=90"),
      apiFetch("/api/adjust"),
    ]);

    const weightData = (await weightRes.json().catch(() => ({}))) as { weighIns?: WeighIn[] };
    const adjustData = (await adjustRes.json().catch(() => null)) as AdjustState | null;

    const rows = weightData.weighIns ?? [];
    setWeighIns(rows);
    setIntakeDays((logDays ?? []).map((d) => ({ date: d.date, totalKcal: Number(d.total_kcal) })));
    setTargetKcal(targets(profileFromRow(onboarding), { displayUnits: "us" }).kcal.value);
    if (adjustRes.ok && adjustData) setAdjust(adjustData);

    const today = new Date().toISOString().slice(0, 10);
    const latest = rows[rows.length - 1];
    setSavedToday(latest?.date === today);
    setWheelLbs(
      Math.round(kgToLbs(latest?.weightKg ?? Number(onboarding.weight_kg))),
    );
    setLoading(false);
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
      <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center bg-[#f4f6f2]">
        <p className="animate-pulse text-[#2c3a2e]">Loading your progress...</p>
        <TabBar />
      </main>
    );
  }

  const safetyGated = adjust?.insufficientData.includes("safety_maintenance_active") ?? false;

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-[#f4f6f2] px-5 pb-28 pt-8">
      <header className="mb-6 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#d3e29f] font-semibold text-[#2c3a2e]">D</span>
        <h1 className="text-lg font-semibold leading-tight text-[#2c3a2e]">Progress</h1>
      </header>

      {error && <p className="mb-4 rounded-2xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-[#2c3a2e]">Weigh in</h2>
        <div className="rounded-2xl bg-[#f8faf5] py-3">
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
          className="press mt-3 w-full rounded-2xl bg-[#2c3a2e] px-5 py-3 font-medium text-white disabled:opacity-60"
        >
          {busy ? "Saving..." : savedToday ? "Update today's weigh-in" : "Log today's weight"}
        </button>
      </section>

      <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-[#2c3a2e]">Weight trend</h2>
        <WeightChart weighIns={weighIns} />
      </section>

      <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-[#2c3a2e]">Intake vs target</h2>
        <IntakeChart days={intakeDays} targetKcal={targetKcal} />
      </section>

      {!safetyGated && adjust && (
        <AdaptCard state={adjust} busy={busy} onResolve={resolveProposal} accepted={accepted} />
      )}

      <p className="mt-8 text-center text-xs leading-5 text-[#829084]">
        Demi offers general wellness guidance, not medical advice.
      </p>

      <TabBar />
    </main>
  );
}
