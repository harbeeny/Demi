"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import { targets, type ProfileInput } from "@/lib/nutrition";
import { CM_PER_INCH, kgToLbs, lbPerWeekToKgPerWeek, lbsToKg } from "@/lib/units";
import { WheelPicker } from "@/components/onboarding/WheelPicker";
import { THEME_CHOICES, ThemeIcon } from "@/components/ThemePill";
import { applyThemeChoice, getThemeChoice, type ThemeChoice } from "@/lib/theme";
import { tapHaptic } from "@/lib/haptics";
import type { ActivityLevel, Budget, CookingSkill, Goal, Sex } from "@/lib/supabase/types";

type Answers = {
  sex: Sex | null;
  /** date of birth; age is derived at validation/save time */
  dobMonth: number; // 0-11
  dobDay: number; // 1-31
  dobYear: number;
  /** canonical height in whole centimeters; the ft-in wheel converts at the edge */
  heightCm: number;
  heightUnit: "ft_in" | "cm";
  /** free-text so the field can start empty like a scale readout */
  weight: string;
  weightUnit: "lbs" | "kg";
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

/** Default to a birth date exactly 18 years ago today: the youngest allowed age. */
const TODAY = new Date();
const DEFAULT_DOB_YEAR = TODAY.getFullYear() - 18;
const DEFAULT_DOB_MONTH = TODAY.getMonth();
const DEFAULT_DOB_DAY = Math.min(TODAY.getDate(), daysInMonth(DEFAULT_DOB_YEAR, DEFAULT_DOB_MONTH));

const INITIAL: Answers = {
  sex: null,
  dobMonth: DEFAULT_DOB_MONTH,
  dobDay: DEFAULT_DOB_DAY,
  dobYear: DEFAULT_DOB_YEAR,
  heightCm: 173, // 5'8"
  heightUnit: "ft_in",
  weight: "",
  weightUnit: "lbs",
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

/** Display labels only; stored values stay low/medium/high for meal tags. */
const BUDGET_LABELS: Record<Budget, string> = {
  low: "$20-50",
  medium: "$50-100",
  high: "$100+",
};

/** Display labels only; stored values stay minimal/basic/confident. */
const SKILL_LABELS: Record<CookingSkill, string> = {
  minimal: "Beginner",
  basic: "Intermediate",
  confident: "Adventurous",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i);

/** Oldest first, so scrolling down moves toward the present like iOS date pickers.
 * Ends at the year of someone turning 18 this year; month/day can still dip under 18,
 * which the inline age check catches. */
const THIS_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 103 }, (_, i) => THIS_YEAR - 120 + i);

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function ageFromDob(year: number, month: number, day: number): number {
  const now = new Date();
  let age = now.getFullYear() - year;
  if (now.getMonth() < month || (now.getMonth() === month && now.getDate() < day)) age--;
  return age;
}

/** 4'0" to 7'6" in 1 inch steps */
const HEIGHT_OPTIONS = Array.from({ length: 43 }, (_, i) => i + 48);
/** 122-229 cm, the same span as the ft-in wheel */
const CM_OPTIONS = Array.from({ length: 108 }, (_, i) => i + 122);

/** 71 -> "5 ft 11 in" */
function formatFtInWords(totalInches: number): string {
  return `${Math.floor(totalInches / 12)} ft ${totalInches % 12} in`;
}

/** Same bounds as the old 80-400 lb wheel, expressed per unit. */
function isValidWeight(weight: string, unit: "lbs" | "kg"): boolean {
  if (!weight.trim()) return false;
  const n = Number(weight);
  if (!Number.isFinite(n)) return false;
  return unit === "lbs" ? n >= 80 && n <= 400 : n >= 36 && n <= 181;
}

/** 8 -> "8:00 am", 20 -> "8:00 pm" */
function hourLabel(h: number): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${h >= 12 ? "pm" : "am"}`;
}

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

  // Device-level, not part of answers: applied live so the rest of the
  // flow is read in the palette picked here. Synced after mount (the page
  // prerenders without a theme attribute).
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>("system");
  useEffect(() => {
    setThemeChoice(getThemeChoice());
  }, []);

  const set = <K extends keyof Answers>(key: K, value: Answers[K]) =>
    setAnswers((a) => ({ ...a, [key]: value }));

  /** Update any part of the birth date, clamping the day to the month's length. */
  const setDob = (part: { month?: number; day?: number; year?: number }) =>
    setAnswers((a) => {
      const month = part.month ?? a.dobMonth;
      const year = part.year ?? a.dobYear;
      const day = Math.min(part.day ?? a.dobDay, daysInMonth(year, month));
      return { ...a, dobMonth: month, dobDay: day, dobYear: year };
    });

  // Steps 0..10 are questions; step 11 is the results screen.
  const TOTAL_QUESTIONS = 11;

  const stepValid = useMemo(() => {
    switch (step) {
      // 0 (appearance) always valid: a choice is always active
      case 1: return answers.sex !== null;
      case 2: {
        const age = ageFromDob(answers.dobYear, answers.dobMonth, answers.dobDay);
        return age >= 18 && age <= 120;
      }
      // 3 (height) is wheel-constrained, always valid
      case 4: return isValidWeight(answers.weight, answers.weightUnit);
      case 5: return answers.goal !== null;
      case 6: return answers.activityLevel !== null;
      default: return true; // remaining steps are optional / have defaults
    }
  }, [step, answers]);

  const profile: ProfileInput | null = useMemo(() => {
    if (!answers.sex || !answers.goal || !answers.activityLevel) return null;
    if (!isValidWeight(answers.weight, answers.weightUnit)) return null;
    return {
      sex: answers.sex,
      age: ageFromDob(answers.dobYear, answers.dobMonth, answers.dobDay),
      heightCm: answers.heightCm,
      weightKg:
        answers.weightUnit === "lbs"
          ? lbsToKg(Number(answers.weight))
          : Number(Number(answers.weight).toFixed(1)),
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

    // Build the first plan here so Today opens with meals, not an empty
    // prompt. If this fails, Today auto-builds on load as a fallback.
    await apiFetch("/api/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ regenerate: false }),
    }).catch(() => {});

    router.push("/today");
  }

  const choiceButton = (selected: boolean) =>
    `press w-full rounded-2xl border px-4 py-3 text-left ${
      selected
        ? "border-(--ink) bg-(--ink) text-(--ink-contrast)"
        : "border-(--border) bg-(--surface) text-(--ink) hover:border-(--accent)"
    }`;

  const chip = (selected: boolean) =>
    `press rounded-full border px-4 py-2 text-sm ${
      selected
        ? "border-(--ink) bg-(--ink) text-(--ink-contrast)"
        : "border-(--border) bg-(--surface) text-(--ink) hover:border-(--accent)"
    }`;

  const numberInput =
    "w-full rounded-2xl border border-(--border-input) bg-(--field) px-4 py-3 text-lg text-(--ink) outline-none transition-[border-color,box-shadow] duration-150 focus:border-(--accent) focus:shadow-[0_0_0_3px_rgba(138,160,111,0.15)]";

  function renderStep() {
    switch (step) {
      case 0:
        return (
          <Question title="How should Demi look?" hint="Applies right away. Change it anytime from your profile.">
            <div role="radiogroup" aria-label="Theme" className="space-y-2">
              {THEME_CHOICES.map((t) => (
                <button
                  key={t.value}
                  role="radio"
                  aria-checked={themeChoice === t.value}
                  className={`${choiceButton(themeChoice === t.value)} flex items-center gap-4 py-5`}
                  onClick={() => {
                    tapHaptic();
                    setThemeChoice(t.value);
                    applyThemeChoice(t.value);
                  }}
                >
                  <span
                    aria-hidden
                    className={themeChoice === t.value ? "text-(--ink-contrast)/80" : "text-(--muted)"}
                  >
                    <ThemeIcon choice={t.value} size={20} />
                  </span>
                  <span className="flex-1 font-medium">{t.label}</span>
                  {t.value === "system" && (
                    <span
                      className={`text-sm ${
                        themeChoice === t.value ? "text-(--ink-contrast)/70" : "text-(--muted)"
                      }`}
                    >
                      Matches your phone
                    </span>
                  )}
                </button>
              ))}
            </div>
          </Question>
        );
      case 1:
        return (
          <Question title="What is your sex?" hint="This drives the BMR equation, nothing else.">
            {([
              { value: "female", label: "Female", icon: "♀" },
              { value: "male", label: "Male", icon: "♂" },
            ] as const).map((s) => (
              <button
                key={s.value}
                className={`${choiceButton(answers.sex === s.value)} flex items-center gap-4 py-6`}
                onClick={() => set("sex", s.value)}
              >
                <span
                  aria-hidden
                  className={`text-2xl ${answers.sex === s.value ? "text-(--ink-contrast)/80" : "text-(--muted)"}`}
                >
                  {s.icon}
                </span>
                <span className="font-medium">{s.label}</span>
              </button>
            ))}
          </Question>
        );
      case 2: {
        const under18 = ageFromDob(answers.dobYear, answers.dobMonth, answers.dobDay) < 18;
        return (
          <div className="flex flex-1 flex-col">
            <h1 className="text-2xl font-semibold text-(--ink)">When were you born?</h1>
            <p className="mt-1 text-sm text-(--muted)">This calibrates your plan.</p>
            <div className="flex flex-1 items-center justify-center gap-1">
              <WheelPicker
                key="dob-month"
                values={MONTH_OPTIONS}
                value={answers.dobMonth}
                onChange={(m) => setDob({ month: m })}
                ariaLabel="Birth month"
                format={(m) => MONTHS[m]}
                itemWidth={118}
                indicator="pill"
              />
              <WheelPicker
                // remount when the month's day-count changes so the wheel re-centers on the clamped day
                key={`dob-day-${daysInMonth(answers.dobYear, answers.dobMonth)}`}
                values={Array.from(
                  { length: daysInMonth(answers.dobYear, answers.dobMonth) },
                  (_, i) => i + 1,
                )}
                value={answers.dobDay}
                onChange={(d) => setDob({ day: d })}
                ariaLabel="Birth day"
                itemWidth={56}
                indicator="pill"
              />
              <WheelPicker
                key="dob-year"
                values={YEAR_OPTIONS}
                value={answers.dobYear}
                onChange={(y) => setDob({ year: y })}
                ariaLabel="Birth year"
                itemWidth={76}
                indicator="pill"
              />
            </div>
            {/* fixed-height slot so the wheels don't shift when the notice appears */}
            <p aria-live="polite" className="min-h-5 pb-2 text-center text-sm text-red-700">
              {under18 ? "You must be over 18 to continue" : ""}
            </p>
          </div>
        );
      }
      case 3: {
        const ftIn = answers.heightUnit === "ft_in";
        return (
          <div className="flex flex-1 flex-col">
            <h1 className="text-2xl font-semibold text-(--ink)">What is your height?</h1>
            <p className="mt-1 text-sm text-(--muted)">It helps size your calorie and macro targets.</p>
            <div className="mt-5 flex rounded-2xl border border-(--border) bg-(--surface) p-1" role="tablist" aria-label="Height units">
              {([
                { value: "ft_in", label: "Feet and inches" },
                { value: "cm", label: "Centimeters" },
              ] as const).map((u) => (
                <button
                  key={u.value}
                  role="tab"
                  aria-selected={answers.heightUnit === u.value}
                  className={`press flex-1 rounded-xl py-2.5 text-sm font-medium ${
                    answers.heightUnit === u.value ? "bg-(--ink) text-(--ink-contrast)" : "text-(--ink)"
                  }`}
                  onClick={() => set("heightUnit", u.value)}
                >
                  {u.label}
                </button>
              ))}
            </div>
            <div className="flex flex-1 items-center justify-center">
              {ftIn ? (
                <WheelPicker
                  key="height-ftin"
                  values={HEIGHT_OPTIONS}
                  value={Math.round(answers.heightCm / CM_PER_INCH)}
                  onChange={(v) => set("heightCm", Math.round(v * CM_PER_INCH))}
                  ariaLabel="Height in feet and inches"
                  format={formatFtInWords}
                  itemWidth={150}
                  indicator="pill"
                />
              ) : (
                <WheelPicker
                  key="height-cm"
                  values={CM_OPTIONS}
                  value={answers.heightCm}
                  onChange={(v) => set("heightCm", v)}
                  ariaLabel="Height in centimeters"
                  format={(v) => `${v} cm`}
                  itemWidth={120}
                  indicator="pill"
                />
              )}
            </div>
          </div>
        );
      }
      case 4: {
        const valid = isValidWeight(answers.weight, answers.weightUnit);
        return (
          <Question title="What is your weight?" hint="Weigh at the same time each day, ideally in the morning.">
            <label htmlFor="weight" className="block pt-2 text-sm font-medium text-(--ink)">
              Current weight
            </label>
            <div className="flex gap-2">
              <input
                id="weight"
                type="text"
                inputMode="decimal"
                className={`${numberInput} flex-1`}
                placeholder={answers.weightUnit === "lbs" ? "165" : "75"}
                value={answers.weight}
                onChange={(e) => set("weight", e.target.value)}
              />
              <select
                aria-label="Weight unit"
                className="rounded-2xl border border-(--border-input) bg-(--field) px-4 py-3 text-lg text-(--ink)"
                value={answers.weightUnit}
                onChange={(e) => {
                  const unit = e.target.value as "lbs" | "kg";
                  if (unit === answers.weightUnit) return;
                  // carry a valid number across the unit switch (165 lbs -> 74.8 kg)
                  setAnswers((a) => ({
                    ...a,
                    weightUnit: unit,
                    weight: isValidWeight(a.weight, a.weightUnit)
                      ? String(unit === "kg" ? lbsToKg(Number(a.weight)) : kgToLbs(Number(a.weight)))
                      : a.weight,
                  }));
                }}
              >
                <option value="lbs">lbs</option>
                <option value="kg">kg</option>
              </select>
            </div>
            {!valid && <p className="text-sm text-(--muted)">Enter a valid weight</p>}
          </Question>
        );
      }
      case 5:
        return (
          <Question title="What's the goal?" hint="You can change this anytime.">
            {GOALS.map((g) => (
              <button key={g.value} className={choiceButton(answers.goal === g.value)}
                onClick={() => { set("goal", g.value); set("goalRateLb", null); }}>
                <span className="font-medium">{g.label}</span>
                <span className={`block text-sm ${answers.goal === g.value ? "text-(--ink-contrast)/70" : "text-(--muted)"}`}>{g.hint}</span>
              </button>
            ))}
            {(answers.goal === "lose_fat" || answers.goal === "build_muscle") && (
              <div className="pt-2">
                <p className="mb-2 text-sm text-(--muted)">How fast? (optional, default is the safe middle)</p>
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
      case 6:
        return (
          <Question title="How active is a normal week?" hint="Count workouts and daily movement together.">
            {ACTIVITY.map((a) => (
              <button key={a.value} className={choiceButton(answers.activityLevel === a.value)}
                onClick={() => set("activityLevel", a.value)}>
                <span className="font-medium">{a.label}</span>
                <span className={`block text-sm ${answers.activityLevel === a.value ? "text-(--ink-contrast)/70" : "text-(--muted)"}`}>{a.hint}</span>
              </button>
            ))}
          </Question>
        );
      case 7:
        return (
          <Question title="How many meals a day, and when?" hint="We space them evenly inside your eating window.">
            <div className="flex gap-2">
              {[2, 3, 4, 5].map((n) => (
                <button key={n} className={chip(answers.mealsPerDay === n)} onClick={() => set("mealsPerDay", n)}>
                  {n} meals
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-3 text-(--ink)">
              <label className="text-sm">First meal</label>
              <select className="rounded-xl border border-(--border-input) bg-(--field) px-3 py-2"
                value={answers.eatingWindowStart}
                onChange={(e) => set("eatingWindowStart", Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 5).map((h) => (
                  <option key={h} value={h}>{hourLabel(h)}</option>
                ))}
              </select>
              <label className="text-sm">Last meal</label>
              <select className="rounded-xl border border-(--border-input) bg-(--field) px-3 py-2"
                value={answers.eatingWindowEnd}
                onChange={(e) => set("eatingWindowEnd", Number(e.target.value))}>
                {Array.from({ length: 8 }, (_, i) => i + 16).map((h) => (
                  <option key={h} value={h}>{hourLabel(h)}</option>
                ))}
              </select>
            </div>
          </Question>
        );
      case 8:
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
      case 9:
        return (
          <Question title="Budget and kitchen comfort?" hint="So the plan fits your wallet and your patience.">
            <p className="text-sm font-medium text-(--ink)">Grocery budget / week</p>
            <div className="flex flex-wrap gap-2">
              {(["low", "medium", "high"] as const).map((b) => (
                <button key={b} className={chip(answers.budget === b)} onClick={() => set("budget", b)}>
                  {BUDGET_LABELS[b]}
                </button>
              ))}
            </div>
            <p className="mt-4 text-sm font-medium text-(--ink)">Cooking</p>
            <div className="flex flex-wrap gap-2">
              {(["minimal", "basic", "confident"] as const).map((c) => (
                <button key={c} className={chip(answers.cookingSkill === c)} onClick={() => set("cookingSkill", c)}>
                  {SKILL_LABELS[c]}
                </button>
              ))}
            </div>
          </Question>
        );
      case 10:
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
                <label className="mb-1 block text-sm text-(--muted)">Around what time?</label>
                <input type="time" className={numberInput}
                  value={answers.trainingTime} onChange={(e) => set("trainingTime", e.target.value)} />
              </div>
            )}
          </Question>
        );
      case 11:
        return (
          <div>
            <h1 className="text-2xl font-semibold text-(--ink)">Your numbers</h1>
            <p className="mt-1 text-sm text-(--muted)">Computed from your answers. Every number has a why.</p>
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
                  <p className="rounded-2xl bg-(--tint) p-4 text-sm leading-6 text-(--tint-ink)">
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
    <main className="mx-auto w-full flex min-h-dvh max-w-md flex-col bg-(--bg) px-6 py-8">
      {/* Progress bar: width only, strong ease-out (emil-design-eng) */}
      <div className="mb-8 h-1.5 w-full overflow-hidden rounded-full bg-(--border)">
        <div
          className="h-full rounded-full bg-(--ink) transition-[width] duration-300 [transition-timing-function:var(--ease-out)]"
          style={{ width: `${(Math.min(step, TOTAL_QUESTIONS) / TOTAL_QUESTIONS) * 100}%` }}
        />
      </div>

      {/* keyed by step so each question enters with the step-in animation */}
      {/* flex so full-height steps (birth date) can stretch; block steps are unaffected */}
      <div key={step} className="step-in flex flex-1 flex-col">{renderStep()}</div>

      <div className="mt-8 flex gap-3">
        {step > 0 && (
          <button
            className="press rounded-2xl border border-(--border) bg-(--surface) px-5 py-3 text-(--ink) hover:border-(--accent)"
            onClick={() => setStep((s) => s - 1)}
          >
            Back
          </button>
        )}
        {step < TOTAL_QUESTIONS ? (
          <button
            className="press flex-1 rounded-2xl bg-(--ink) px-5 py-3 font-medium text-(--ink-contrast) disabled:opacity-40"
            disabled={!stepValid}
            onClick={() => setStep((s) => s + 1)}
          >
            {step === 0 || step === 2 || (step >= 7 && step <= 10) ? "Continue" : "Next"}
          </button>
        ) : (
          <button
            className="press flex-1 rounded-2xl bg-(--ink) px-5 py-3 font-medium text-(--ink-contrast) disabled:opacity-60"
            disabled={!results || saving}
            onClick={finish}
          >
            {saving ? "Building your plan..." : "Looks right, build my plan"}
          </button>
        )}
      </div>

      <p className="mt-6 text-center text-xs leading-5 text-(--muted)">
        Demi offers general wellness guidance, not medical advice.
      </p>
    </main>
  );
}

function Question({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-(--ink)">{title}</h1>
      <p className="mb-5 mt-1 text-sm text-(--muted)">{hint}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ResultRow({ label, value, why }: { label: string; value: string; why: string }) {
  return (
    <div className="rounded-2xl bg-(--surface) p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-(--muted)">{label}</span>
        <span className="text-lg font-semibold text-(--ink)">{value}</span>
      </div>
      <p className="mt-1 text-sm leading-5 text-(--ink-2)">{why}</p>
    </div>
  );
}
