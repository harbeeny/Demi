import { NextResponse } from "next/server";

import { loadContext } from "@/lib/plan/context";
import { preflight, withCors } from "@/lib/plan/cors";
import type { ActivityLevel, Budget, CookingSkill, Goal, Sex } from "@/lib/supabase/types";

const SEXES: Sex[] = ["male", "female", "other"];
const GOALS: Goal[] = ["lose_fat", "build_muscle", "maintain", "improve_health"];
const ACTIVITY: ActivityLevel[] = ["sedentary", "light", "moderate", "active", "very_active"];
const BUDGETS: Budget[] = ["low", "medium", "high"];
const SKILLS: CookingSkill[] = ["minimal", "basic", "confident"];

interface ProfileBody {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  goal: Goal;
  goalRate: number | null;
  activityLevel: ActivityLevel;
  dietaryPrefs: string[];
  allergies: string[];
  dislikes: string[];
  budget: Budget;
  cookingSkill: CookingSkill;
  mealsPerDay: number;
  eatingWindowStart: number;
  eatingWindowEnd: number;
  trainingDays: string[];
  trainingTime: string | null;
}

function invalid(b: Partial<ProfileBody>): string | null {
  if (!b.sex || !SEXES.includes(b.sex)) return "sex";
  if (!Number.isInteger(b.age) || b.age! < 13 || b.age! > 120) return "age";
  if (!Number.isFinite(b.heightCm) || b.heightCm! < 90 || b.heightCm! > 250) return "height";
  if (!Number.isFinite(b.weightKg) || b.weightKg! <= 0 || b.weightKg! >= 500) return "weight";
  if (!b.goal || !GOALS.includes(b.goal)) return "goal";
  if (b.goalRate !== null && (!Number.isFinite(b.goalRate) || b.goalRate! < 0 || b.goalRate! > 1)) return "goal rate";
  if (!b.activityLevel || !ACTIVITY.includes(b.activityLevel)) return "activity";
  if (!b.budget || !BUDGETS.includes(b.budget)) return "budget";
  if (!b.cookingSkill || !SKILLS.includes(b.cookingSkill)) return "cooking skill";
  if (!Number.isInteger(b.mealsPerDay) || b.mealsPerDay! < 1 || b.mealsPerDay! > 6) return "meals per day";
  if (!Number.isInteger(b.eatingWindowStart) || b.eatingWindowStart! < 0 || b.eatingWindowStart! > 23) return "eating window";
  if (!Number.isInteger(b.eatingWindowEnd) || b.eatingWindowEnd! <= b.eatingWindowStart! || b.eatingWindowEnd! > 24) return "eating window";
  if (!Array.isArray(b.dietaryPrefs) || !Array.isArray(b.allergies) || !Array.isArray(b.dislikes) || !Array.isArray(b.trainingDays)) return "preferences";
  return null;
}

/**
 * Profile edit: inserts a fresh onboarding row (history preserved; every
 * reader takes the latest). The existing tdee_correction carries over; the
 * detection window keys off this row's created_at, so it re-evaluates
 * against the new profile automatically.
 */
async function post(request: Request): Promise<Response> {
  const ctx = await loadContext(request);
  if ("error" in ctx) return ctx.error;
  const { supabase, user, onboarding } = ctx;

  const body = (await request.json().catch(() => null)) as ProfileBody | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const bad = invalid(body);
  if (bad) return NextResponse.json({ error: `Check the ${bad} value.` }, { status: 400 });

  const { error } = await supabase.from("onboarding_answers").insert({
    user_id: user.id,
    sex: body.sex,
    age: body.age,
    height_cm: Math.round(body.heightCm * 10) / 10,
    weight_kg: Math.round(body.weightKg * 10) / 10,
    goal: body.goal,
    goal_rate: body.goalRate,
    activity_level: body.activityLevel,
    dietary_prefs: body.dietaryPrefs.map(String).slice(0, 10),
    allergies: body.allergies.map(String).slice(0, 20),
    dislikes: body.dislikes.map(String).slice(0, 20),
    budget: body.budget,
    cooking_skill: body.cookingSkill,
    meals_per_day: body.mealsPerDay,
    eating_window_start: body.eatingWindowStart,
    eating_window_end: body.eatingWindowEnd,
    training_days: body.trainingDays.map(String).slice(0, 7),
    training_time: body.trainingTime,
    tdee_correction: onboarding.tdee_correction,
  });

  if (error) {
    return NextResponse.json({ error: "Couldn't save your profile." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export const POST = withCors(post);
export const OPTIONS = preflight("POST, OPTIONS");
