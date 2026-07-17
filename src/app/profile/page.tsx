"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import { targets } from "@/lib/nutrition";
import { profileFromRow, type OnboardingRow } from "@/lib/plan/rows";
import { cmToFtIn, formatFtIn, inchesToCm, kgToLbs, lbsToKg } from "@/lib/units";
import { localDateISO } from "@/lib/dates";
import type { ActivityLevel, Budget, CookingSkill, Goal } from "@/lib/supabase/types";
import { TabBar } from "@/components/TabBar";
import { ThemePill } from "@/components/ThemePill";

const GOALS: Array<{ value: Goal; label: string }> = [
  { value: "lose_fat", label: "Lose body fat" },
  { value: "build_muscle", label: "Build muscle" },
  { value: "maintain", label: "Maintain" },
  { value: "improve_health", label: "Feel healthier" },
];
const ACTIVITY: Array<{ value: ActivityLevel; label: string }> = [
  { value: "sedentary", label: "Mostly sitting" },
  { value: "light", label: "Lightly active" },
  { value: "moderate", label: "Moderately active" },
  { value: "active", label: "Active" },
  { value: "very_active", label: "Very active" },
];
const BUDGET_LABELS: Record<Budget, string> = { low: "$20-50", medium: "$50-100", high: "$100+" };
const SKILL_LABELS: Record<CookingSkill, string> = {
  minimal: "Beginner",
  basic: "Intermediate",
  confident: "Adventurous",
};
const DIET_OPTIONS = ["vegetarian", "vegan", "pescatarian", "gluten_free"];
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState<OnboardingRow | null>(null);
  const [goal, setGoal] = useState<Goal>("maintain");
  const [goalRateLb, setGoalRateLb] = useState<number | null>(null);
  const [activity, setActivity] = useState<ActivityLevel>("moderate");
  const [weightLbs, setWeightLbs] = useState(165);
  const [heightIn, setHeightIn] = useState(68);
  const [age, setAge] = useState(30);
  const [mealsPerDay, setMealsPerDay] = useState(3);
  const [dietaryPrefs, setDietaryPrefs] = useState<string[]>([]);
  const [allergies, setAllergies] = useState("");
  const [dislikes, setDislikes] = useState("");
  const [budget, setBudget] = useState<Budget>("medium");
  const [skill, setSkill] = useState<CookingSkill>("basic");
  const [trainingDays, setTrainingDays] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [kcalNow, setKcalNow] = useState(0);

  const load = useCallback(async () => {
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
    setRow(onboarding);
    setGoal(onboarding.goal);
    setGoalRateLb(onboarding.goal_rate === null ? null : Math.round(Number(onboarding.goal_rate) * 2.20462 * 4) / 4);
    setActivity(onboarding.activity_level);
    setWeightLbs(Math.round(kgToLbs(Number(onboarding.weight_kg))));
    setHeightIn(Math.round(Number(onboarding.height_cm) / 2.54));
    setAge(onboarding.age);
    setMealsPerDay(onboarding.meals_per_day);
    setDietaryPrefs(onboarding.dietary_prefs);
    setAllergies(onboarding.allergies.join(", "));
    setDislikes(onboarding.dislikes.join(", "));
    setBudget(onboarding.budget);
    setSkill(onboarding.cooking_skill);
    setTrainingDays(onboarding.training_days);
    setKcalNow(targets(profileFromRow(onboarding), { displayUnits: "us" }).kcal.value);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!row) return;
    setBusy("save");
    setError("");
    setNotice("");
    try {
      const res = await apiFetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sex: row.sex,
          age,
          heightCm: inchesToCm(heightIn),
          weightKg: lbsToKg(weightLbs),
          goal,
          goalRate: goalRateLb === null ? null : Math.round((goalRateLb / 2.20462) * 100) / 100,
          activityLevel: activity,
          dietaryPrefs,
          allergies: allergies.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
          dislikes: dislikes.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
          budget,
          cookingSkill: skill,
          mealsPerDay,
          eatingWindowStart: row.eating_window_start,
          eatingWindowEnd: row.eating_window_end,
          trainingDays,
          trainingTime: row.training_time,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Couldn't save your profile.");
      } else {
        setNotice("Saved. Your targets update from here on.");
        await load();
      }
    } catch {
      setError("Network hiccup. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function exportData() {
    setBusy("export");
    setError("");
    try {
      const res = await apiFetch("/api/export");
      if (!res.ok) {
        setError("Couldn't export your data.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `demi-export-${localDateISO()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Network hiccup. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    setBusy("signout");
    try {
      await createClient().auth.signOut();
      router.push("/");
      router.refresh();
    } catch {
      setError("Couldn't sign out. Try again.");
      setBusy(null);
    }
  }

  const chip = (selected: boolean) =>
    `press rounded-full border px-4 py-2 text-sm ${
      selected
        ? "border-(--ink) bg-(--ink) text-(--ink-contrast)"
        : "border-(--border) bg-(--surface) text-(--ink) hover:border-(--accent)"
    }`;
  const input =
    "w-full rounded-2xl border border-(--border-input) bg-(--field) px-3 py-2 text-sm text-(--ink) outline-none focus:border-(--accent)";

  if (loading) {
    return (
      <main className="mx-auto w-full flex min-h-dvh max-w-md items-center justify-center bg-(--bg)">
        <p className="animate-pulse text-(--ink)">Loading your profile...</p>
        <TabBar />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full min-h-dvh max-w-md bg-(--bg) px-5 pb-28 pt-8">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-(--accent-tint) font-semibold text-(--ink)">D</span>
          <div>
            <h1 className="text-lg font-semibold leading-tight text-(--ink)">Profile</h1>
            <p className="text-xs text-(--muted)">Daily target: {kcalNow} kcal</p>
          </div>
        </div>
        <button
          onClick={signOut}
          disabled={busy !== null}
          className="press rounded-full px-3 py-2 text-sm text-(--muted) hover:text-(--ink) disabled:opacity-50"
        >
          {busy === "signout" ? "Signing out..." : "Sign out"}
        </button>
      </header>

      <div className="mb-6 flex justify-end">
        <ThemePill />
      </div>

      {error && <p className="mb-4 rounded-2xl bg-(--danger-bg) p-3 text-sm text-(--danger-ink)">{error}</p>}
      {notice && <p className="mb-4 rounded-2xl bg-(--tint) p-3 text-sm text-(--tint-ink)">{notice}</p>}

      <section className="space-y-4 rounded-3xl bg-(--surface) p-5 shadow-sm">
        <div>
          <p className="mb-2 text-sm font-medium text-(--ink)">Goal</p>
          <div className="flex flex-wrap gap-2">
            {GOALS.map((g) => (
              <button key={g.value} className={chip(goal === g.value)} onClick={() => { setGoal(g.value); setGoalRateLb(null); }}>
                {g.label}
              </button>
            ))}
          </div>
          {(goal === "lose_fat" || goal === "build_muscle") && (
            <div className="mt-2 flex gap-2">
              {(goal === "lose_fat" ? [0.5, 1, 1.5] : [0.25, 0.5, 1]).map((r) => (
                <button key={r} className={chip(goalRateLb === r)} onClick={() => setGoalRateLb(r)}>
                  {r} lb/wk
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-(--ink)">Activity</p>
          <div className="flex flex-wrap gap-2">
            {ACTIVITY.map((a) => (
              <button key={a.value} className={chip(activity === a.value)} onClick={() => setActivity(a.value)}>
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs text-(--muted)">
            Age
            <input type="number" min={13} max={120} className={`${input} mt-1`} value={age}
              onChange={(e) => setAge(Number(e.target.value))} />
          </label>
          <label className="text-xs text-(--muted)">
            Weight (lbs)
            <input type="number" min={80} max={400} className={`${input} mt-1`} value={weightLbs}
              onChange={(e) => setWeightLbs(Number(e.target.value))} />
          </label>
          <label className="text-xs text-(--muted)">
            Height ({formatFtIn(heightIn)})
            <input type="number" min={48} max={90} className={`${input} mt-1`} value={heightIn}
              onChange={(e) => setHeightIn(Number(e.target.value))} />
          </label>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-(--ink)">Meals per day</p>
          <div className="flex gap-2">
            {[2, 3, 4, 5].map((n) => (
              <button key={n} className={chip(mealsPerDay === n)} onClick={() => setMealsPerDay(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-(--ink)">Eating pattern</p>
          <div className="flex flex-wrap gap-2">
            {DIET_OPTIONS.map((d) => (
              <button key={d} className={chip(dietaryPrefs.includes(d))}
                onClick={() =>
                  setDietaryPrefs((prev) =>
                    prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
                  )
                }>
                {d.replace("_", "-")}
              </button>
            ))}
          </div>
          <input type="text" className={`${input} mt-2`} placeholder="Allergies, comma-separated"
            value={allergies} onChange={(e) => setAllergies(e.target.value)} />
          <input type="text" className={`${input} mt-2`} placeholder="Foods you don't like"
            value={dislikes} onChange={(e) => setDislikes(e.target.value)} />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-(--ink)">Budget and cooking</p>
          <div className="flex flex-wrap gap-2">
            {(["low", "medium", "high"] as const).map((b) => (
              <button key={b} className={chip(budget === b)} onClick={() => setBudget(b)}>
                {BUDGET_LABELS[b]}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["minimal", "basic", "confident"] as const).map((c) => (
              <button key={c} className={chip(skill === c)} onClick={() => setSkill(c)}>
                {SKILL_LABELS[c]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-(--ink)">Training days</p>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => (
              <button key={d} className={chip(trainingDays.includes(d))}
                onClick={() =>
                  setTrainingDays((prev) =>
                    prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
                  )
                }>
                {d.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={save}
          disabled={busy !== null}
          className="press w-full rounded-2xl bg-(--ink) px-5 py-3 font-medium text-(--ink-contrast) disabled:opacity-60"
        >
          {busy === "save" ? "Saving..." : "Save changes"}
        </button>
      </section>

      <section className="mt-4 rounded-3xl bg-(--surface) p-5 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-(--ink)">Your data</h2>
        <p className="text-sm leading-6 text-(--ink-2)">
          Download everything Demi has stored for you as one JSON file: profile history, plans,
          logs, weigh-ins, and reflections.
        </p>
        <button
          onClick={exportData}
          disabled={busy !== null}
          className="press mt-3 w-full rounded-2xl border border-(--border) bg-(--surface) px-5 py-3 text-sm font-medium text-(--ink) hover:border-(--accent) disabled:opacity-50"
        >
          {busy === "export" ? "Preparing..." : "Export my data"}
        </button>
      </section>

      <p className="mt-8 text-center text-xs leading-5 text-(--muted)">
        Demi offers general wellness guidance, not medical advice.
      </p>

      <TabBar />
    </main>
  );
}
