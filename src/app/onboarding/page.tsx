"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { targets, type ProfileInput } from "@/lib/nutrition";
import { formatFtIn, inchesToCm, lbPerWeekToKgPerWeek, lbsToKg } from "@/lib/units";
import { WheelPicker } from "@/components/onboarding/WheelPicker";
import type { ActivityLevel, Budget, CookingSkill, Goal, Sex } from "@/lib/supabase/types";

type Answers = {
  sex: Sex | null;
  age: string;
  heightInches: number;
  weightLbs: number;
  goal: Goal | null;
  /** stored in lb/week for display; converted to kg/week on save */
  goalRateLb: number | null;
  activityLevel: ActivityLevel | null;
  mealsPerDay: number;
  eatingWindowStart: number;
  eatingWindowEnd: number;
  dietaryPrefs: string[];
  allergies: string;
  dislikes: string;
  budget: Budget;
  cookingSkill: CookingSkill;
  trainingDays: string[];
  trainingTime: string;
};

const INITIAL: Answers = {
  sex: null,
  age: "",
  heightInches: 68, // 5'8"
  weightLbs: 165,
  goal: null,
  goalRateLb: null,
  activityLevel: null,
  mealsPerDay: 3,
  eatingWindowStart: 8,
  eatingWindowEnd: 20,
  dietaryPrefs: [],
  allergies: "",
  dislikes: "",
  budget: "medium",
  cookingSkill: "basic",
  trainingDays: [],
  trainingTime: "",
};

const GOALS: Array<{ value: Goal; label: string; hint: string }> = [
  { value: "lose_fat", label: "Lose body fat", hint: "Steady, sustainable cut" },
  { value: "build_muscle", label: "Build muscle", hint: "Lean gaining" },
  { value: "maintain", label: "Maintain", hint: "Hold steady, eat well" },
  { value: "improve_health", label: "Feel healthier", hint: "Energy and habits first" },
];

const ACTIVITY: Array<{ value: ActivityLevel; label: string; hint: string }> = [
  { value: "sedentary", label: "Mostly sitting", hint: "Desk job, little movement" },
  { value: "light", label: "Lightly active", hint: "1-3 workouts a week" },
  { value: "moderate", label: "Moderately active", hint: "3-5 workouts a week" },
  { value: "active", label: "Active", hint: "6-7 workouts a week" },
  { value: "very_active", label: "Very active", hint: "Physical job or 2x daily" },
];

const DIET_OPTIONS = ["vegetarian", "vegan", "pescatarian", "gluten_free"];
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/** 4'0" to 7'6" in 1 inch steps */
const HEIGHT_OPTIONS = Array.from({ length: 43 }, (_, i) => i + 48);
/** 80-400 lbs in 1 lb steps */
const WEIGHT_OPTIONS = Array.from({ length: 321 }, (_, i) => i + 80);

function splitList(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(INITIAL);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const set = <K extends keyof Answers>(key: K, value: Answers[K]) =>
    setAnswers((a) => ({ ...a, [key]: value }));

  // Steps 0..9 are questions; step 10 is the results screen.
  const TOTAL_QUESTIONS = 10;

  const stepValid = useMemo(() => {
    switch (step) {
      case 0: return answers.sex !== null;
      case 1: {
        const n = Number(answers.age);
        return Number.isInteger(n) && n >= 13 && n <= 120;
      }
      // 2 (height) and 3 (weight) are wheel-constrained, always valid
      case 4: return answers.goal !== null;
      case 5: return answers.activityLevel !== null;
      default: return true; // remaining steps are optional / have defaults
    }
  }, [step, answers]);

  const profile: ProfileInput | null = useMemo(() => {
    if (!answers.sex || !answers.goal || !answers.activityLevel) return null;
    return {
      sex: answers.sex,
      age: Number(answers.age),
      heightCm: inchesToCm(answers.heightInches),
      weightKg: lbsToKg(answers.weightLbs),
      goal: answers.goal,
      goalRate: answers.goalRateLb === null ? null : lbPerWeekToKgPerWeek(answers.goalRateLb),
      activityLevel: answers.activityLevel,
      mealsPerDay: answers.mealsPerDay,
      eatingWindowStart: answers.eatingWindowStart,
      eatingWindowEnd: answers.eatingWindowEnd,
      trainingDays: answers.trainingDays,
      trainingTime: answers.trainingTime || null,
    };
  }, [answers]);

  const results = useMemo(() => {
    if (step !== TOTAL_QUESTIONS || !profile) return null;
    try {
      return targets(profile, { displayUnits: "us" });
    } catch {
      return null;
    }
  }, [step, profile]);

  async function finish() {
    if (!profile || saving) return;
    setSaving(true);
    setSaveError("");

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const { error: insertError } = await supabase.from("onboarding_answers").insert({
      user_id: user.id,
      sex: profile.sex,
      age: profile.age,
      height_cm: profile.heightCm,
      weight_kg: profile.weightKg,
      goal: profile.goal,
      goal_rate: profile.goalRate,
      activity_level: profile.activityLevel,
      dietary_prefs: answers.dietaryPrefs,
      allergies: splitList(answers.allergies),
      dislikes: splitList(answers.dislikes),
      budget: answers.budget,
      cooking_skill: answers.cookingSkill,
      meals_per_day: profile.mealsPerDay,
      eating_window_start: profile.eatingWindowStart,
      eating_window_end: profile.eatingWindowEnd,
      training_days: profile.trainingDays,
      training_time: profile.trainingTime,
    });

    if (insertError) {
      setSaveError("Couldn't save your answers. Try again.");
      setSaving(false);
      return;
    }

    await supabase.from("profiles").update({ onboarding_complete: true }).eq("id", user.id);
    router.push("/today");
  }

  const choiceButton = (selected: boolean) =>
    `press w-full rounded-2xl border px-4 py-3 text-left ${
      selected
        ? "border-[#2c3a2e] bg-[#2c3a2e] text-white"
        : "border-[#dce3d7] bg-white text-[#2c3a2e] hover:border-[#8aa06f]"
    }`;

  const chip = (selected: boolean) =>
    `press rounded-full border px-4 py-2 text-sm ${
      selected
        ? "border-[#2c3a2e] bg-[#2c3a2e] text-white"
        : "border-[#dce3d7] bg-white text-[#2c3a2e] hover:border-[#8aa06f]"
    }`;

  const numberInput =
    "w-full rounded-2xl border border-[#dce3d7] bg-white px-4 py-3 text-lg text-[#2c3a2e] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[#8aa06f] focus:shadow-[0_0_0_3px_rgba(138,160,111,0.15)]";

  function renderStep() {
    switch (step) {
      case 0:
        return (
          <Question title="What sex should we use for your metabolism math?" hint="This drives the BMR equation, nothing else.">
            {(["male", "female", "other"] as const).map((s) => (
              <button key={s} className={choiceButton(answers.sex === s)} onClick={() => set("sex", s)}>
                {s === "male" ? "Male" : s === "female" ? "Female" : "Other / prefer not to say"}
              </button>
            ))}
          </Question>
        );
      case 1:
        return (
          <Question title="How old are you?" hint="13-120. Under 18 gets maintenance targets only.">
            <input type="number" inputMode="numeric" className={numberInput} placeholder="e.g. 29"
              value={answers.age} onChange={(e) => set("age", e.target.value)} />
          </Question>
        );
      case 2:
        return (
          <Question title="How tall are you?" hint="Scroll the wheel; each tick is one inch.">
            <div className="flex items-center justify-center rounded-2xl bg-white py-2 shadow-sm">
              <WheelPicker
                key="height"
                values={HEIGHT_OPTIONS}
                value={answers.heightInches}
                onChange={(v) => set("heightInches", v)}
                ariaLabel="Height in feet and inches"
                format={formatFtIn}
              />
            </div>
          </Question>
        );
      case 3:
        return (
          <Question title="What do you weigh right now?" hint="Slide left or right. A morning weigh-in is most consistent.">
            <div className="rounded-2xl bg-white py-3 shadow-sm">
              <WheelPicker
                key="weight"
                values={WEIGHT_OPTIONS}
                value={answers.weightLbs}
                onChange={(v) => set("weightLbs", v)}
                label="lbs"
                ariaLabel="Weight in pounds"
                orientation="horizontal"
              />
            </div>
          </Question>
        );
      case 4:
        return (
          <Question title="What's the goal?" hint="You can change this anytime.">
            {GOALS.map((g) => (
              <button key={g.value} className={choiceButton(answers.goal === g.value)}
                onClick={() => { set("goal", g.value); set("goalRateLb", null); }}>
                <span className="font-medium">{g.label}</span>
                <span className={`block text-sm ${answers.goal === g.value ? "text-white/70" : "text-[#829084]"}`}>{g.hint}</span>
              </button>
            ))}
            {(answers.goal === "lose_fat" || answers.goal === "build_muscle") && (
              <div className="pt-2">
                <p className="mb-2 text-sm text-[#829084]">How fast? (optional, default is the safe middle)</p>
                <div className="flex gap-2">
                  {(answers.goal === "lose_fat" ? [0.5, 1, 1.5] : [0.25, 0.5, 1]).map((r) => (
                    <button key={r} className={chip(answers.goalRateLb === r)} onClick={() => set("goalRateLb", r)}>
                      {r} lb/wk
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Question>
        );
      case 5:
        return (
          <Question title="How active is a normal week?" hint="Count workouts and daily movement together.">
            {ACTIVITY.map((a) => (
              <button key={a.value} className={choiceButton(answers.activityLevel === a.value)}
                onClick={() => set("activityLevel", a.value)}>
                <span className="font-medium">{a.label}</span>
                <span className={`block text-sm ${answers.activityLevel === a.value ? "text-white/70" : "text-[#829084]"}`}>{a.hint}</span>
              </button>
            ))}
          </Question>
        );
      case 6:
        return (
          <Question title="How many meals a day, and when?" hint="We space them evenly inside your eating window.">
            <div className="flex gap-2">
              {[2, 3, 4, 5].map((n) => (
                <button key={n} className={chip(answers.mealsPerDay === n)} onClick={() => set("mealsPerDay", n)}>
                  {n} meals
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-3 text-[#2c3a2e]">
              <label className="text-sm">First meal</label>
              <select className="rounded-xl border border-[#dce3d7] bg-white px-3 py-2"
                value={answers.eatingWindowStart}
                onChange={(e) => set("eatingWindowStart", Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 5).map((h) => (
                  <option key={h} value={h}>{h}:00</option>
                ))}
              </select>
              <label className="text-sm">Last meal</label>
              <select className="rounded-xl border border-[#dce3d7] bg-white px-3 py-2"
                value={answers.eatingWindowEnd}
                onChange={(e) => set("eatingWindowEnd", Number(e.target.value))}>
                {Array.from({ length: 8 }, (_, i) => i + 16).map((h) => (
                  <option key={h} value={h}>{h}:00</option>
                ))}
              </select>
            </div>
          </Question>
        );
      case 7:
        return (
          <Question title="Any eating pattern or allergies?" hint="Optional. Allergies are hard rules, never suggested.">
            <div className="flex flex-wrap gap-2">
              {DIET_OPTIONS.map((d) => (
                <button key={d} className={chip(answers.dietaryPrefs.includes(d))}
                  onClick={() =>
                    set("dietaryPrefs", answers.dietaryPrefs.includes(d)
                      ? answers.dietaryPrefs.filter((x) => x !== d)
                      : [...answers.dietaryPrefs, d])
                  }>
                  {d.replace("_", "-")}
                </button>
              ))}
            </div>
            <input type="text" className={`${numberInput} mt-3 text-base`} placeholder="Allergies, comma-separated (e.g. peanut, shellfish)"
              value={answers.allergies} onChange={(e) => set("allergies", e.target.value)} />
            <input type="text" className={`${numberInput} mt-2 text-base`} placeholder="Foods you just don't like (e.g. mushrooms)"
              value={answers.dislikes} onChange={(e) => set("dislikes", e.target.value)} />
          </Question>
        );
      case 8:
        return (
          <Question title="Budget and kitchen comfort?" hint="So the plan fits your wallet and your patience.">
            <p className="text-sm font-medium text-[#2c3a2e]">Grocery budget</p>
            <div className="flex gap-2">
              {(["low", "medium", "high"] as const).map((b) => (
                <button key={b} className={chip(answers.budget === b)} onClick={() => set("budget", b)}>{b}</button>
              ))}
            </div>
            <p className="mt-4 text-sm font-medium text-[#2c3a2e]">Cooking</p>
            <div className="flex gap-2">
              {(["minimal", "basic", "confident"] as const).map((c) => (
                <button key={c} className={chip(answers.cookingSkill === c)} onClick={() => set("cookingSkill", c)}>{c}</button>
              ))}
            </div>
          </Question>
        );
      case 9:
        return (
          <Question title="Do you train on set days?" hint="Optional. We'll put more carbs near your sessions.">
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => (
                <button key={d} className={chip(answers.trainingDays.includes(d))}
                  onClick={() =>
                    set("trainingDays", answers.trainingDays.includes(d)
                      ? answers.trainingDays.filter((x) => x !== d)
                      : [...answers.trainingDays, d])
                  }>
                  {d.slice(0, 3)}
                </button>
              ))}
            </div>
            {answers.trainingDays.length > 0 && (
              <div className="mt-3">
                <label className="mb-1 block text-sm text-[#829084]">Around what time?</label>
                <input type="time" className={numberInput}
                  value={answers.trainingTime} onChange={(e) => set("trainingTime", e.target.value)} />
              </div>
            )}
          </Question>
        );
      case 10:
        return (
          <div>
            <h1 className="text-2xl font-semibold text-[#2c3a2e]">Your numbers</h1>
            <p className="mt-1 text-sm text-[#829084]">Computed from your answers. Every number has a why.</p>
            {results ? (
              <div className="mt-5 space-y-3">
                <ResultRow label="Daily calories" value={`${results.kcal.value} kcal`} why={results.kcal.reasoning.explanation} />
                <ResultRow label="Protein" value={`${results.proteinG.value} g`} why={results.proteinG.reasoning.explanation} />
                <ResultRow label="Carbs" value={`${results.carbsG.value} g`} why={results.carbsG.reasoning.explanation} />
                <ResultRow label="Fat" value={`${results.fatG.value} g`} why={results.fatG.reasoning.explanation} />
                <ResultRow label="Fiber" value={`${results.fiberG.value} g`} why={results.fiberG.reasoning.explanation} />
                {results.flooredBySafety && (
                  <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
                    We raised your target to a safe minimum. Slower progress, but sustainable.
                  </p>
                )}
                {results.rateCappedBySafety && (
                  <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
                    We slowed your pace to about 1% of bodyweight per week. Faster loss tends to cost muscle and rebound.
                  </p>
                )}
                {results.underweightMaintenanceApplied && (
                  <p className="rounded-2xl bg-[#e9efdd] p-4 text-sm leading-6 text-[#3c4a3e]">
                    Based on your height and weight, we set your plan to maintenance instead of a deficit; fueling well is the strongest move from here. If food or body image ever feels stressful, support helps: the NEDA helpline (1-800-931-2237) is free and confidential.
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-5 text-sm text-red-700">Something&apos;s off with your inputs. Go back and check them.</p>
            )}
            {saveError && <p className="mt-3 text-sm text-red-700">{saveError}</p>}
          </div>
        );
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-[#f4f6f2] px-6 py-8">
      {/* Progress bar: width only, strong ease-out (emil-design-eng) */}
      <div className="mb-8 h-1.5 w-full overflow-hidden rounded-full bg-[#dce3d7]">
        <div
          className="h-full rounded-full bg-[#2c3a2e] transition-[width] duration-300 [transition-timing-function:var(--ease-out)]"
          style={{ width: `${(Math.min(step, TOTAL_QUESTIONS) / TOTAL_QUESTIONS) * 100}%` }}
        />
      </div>

      {/* keyed by step so each question enters with the step-in animation */}
      <div key={step} className="step-in flex-1">{renderStep()}</div>

      <div className="mt-8 flex gap-3">
        {step > 0 && (
          <button
            className="press rounded-2xl border border-[#dce3d7] bg-white px-5 py-3 text-[#2c3a2e] hover:border-[#8aa06f]"
            onClick={() => setStep((s) => s - 1)}
          >
            Back
          </button>
        )}
        {step < TOTAL_QUESTIONS ? (
          <button
            className="press flex-1 rounded-2xl bg-[#2c3a2e] px-5 py-3 font-medium text-white disabled:opacity-40"
            disabled={!stepValid}
            onClick={() => setStep((s) => s + 1)}
          >
            {step >= 6 && step <= 9 ? "Continue" : "Next"}
          </button>
        ) : (
          <button
            className="press flex-1 rounded-2xl bg-[#2c3a2e] px-5 py-3 font-medium text-white disabled:opacity-60"
            disabled={!results || saving}
            onClick={finish}
          >
            {saving ? "Saving..." : "Looks right, build my plan"}
          </button>
        )}
      </div>

      <p className="mt-6 text-center text-xs leading-5 text-[#829084]">
        Demi offers general wellness guidance, not medical advice.
      </p>
    </main>
  );
}

function Question({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-[#2c3a2e]">{title}</h1>
      <p className="mb-5 mt-1 text-sm text-[#829084]">{hint}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ResultRow({ label, value, why }: { label: string; value: string; why: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-[#829084]">{label}</span>
        <span className="text-lg font-semibold text-[#2c3a2e]">{value}</span>
      </div>
      <p className="mt-1 text-sm leading-5 text-[#5d6b5f]">{why}</p>
    </div>
  );
}
