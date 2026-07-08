export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";

export type Goal =
  | "lose_fat"
  | "build_muscle"
  | "maintain"
  | "improve_health";

export type Sex = "male" | "female" | "other";

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export interface MealPlanEntry {
  meal_id: string;
  slot: MealSlot;
  servings: number;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          created_at: string;
          onboarding_complete: boolean;
        };
        Insert: {
          id: string;
          created_at?: string;
          onboarding_complete?: boolean;
        };
        Update: {
          id?: string;
          created_at?: string;
          onboarding_complete?: boolean;
        };
      };
      onboarding_answers: {
        Row: {
          id: string;
          user_id: string;
          sex: Sex;
          age: number;
          height_cm: number;
          weight_kg: number;
          goal: Goal;
          activity_level: ActivityLevel;
          dietary_prefs: string[];
          allergies: string[];
          meals_per_day: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          sex: Sex;
          age: number;
          height_cm: number;
          weight_kg: number;
          goal: Goal;
          activity_level: ActivityLevel;
          dietary_prefs?: string[];
          allergies?: string[];
          meals_per_day?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          sex?: Sex;
          age?: number;
          height_cm?: number;
          weight_kg?: number;
          goal?: Goal;
          activity_level?: ActivityLevel;
          dietary_prefs?: string[];
          allergies?: string[];
          meals_per_day?: number;
          created_at?: string;
        };
      };
      meals: {
        Row: {
          id: string;
          name: string;
          kcal: number;
          protein_g: number;
          carbs_g: number;
          fat_g: number;
          fiber_g: number;
          tags: string[];
          source: string;
        };
        Insert: {
          id?: string;
          name: string;
          kcal: number;
          protein_g: number;
          carbs_g: number;
          fat_g: number;
          fiber_g: number;
          tags?: string[];
          source: string;
        };
        Update: {
          id?: string;
          name?: string;
          kcal?: number;
          protein_g?: number;
          carbs_g?: number;
          fat_g?: number;
          fiber_g?: number;
          tags?: string[];
          source?: string;
        };
      };
      meal_plans: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          generated_at: string;
          llm_rationale: string;
          meals: MealPlanEntry[];
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          generated_at?: string;
          llm_rationale: string;
          meals: MealPlanEntry[];
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          generated_at?: string;
          llm_rationale?: string;
          meals?: MealPlanEntry[];
        };
      };
      daily_logs: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          total_kcal: number;
          total_protein_g: number;
          total_carbs_g: number;
          total_fat_g: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          total_kcal: number;
          total_protein_g: number;
          total_carbs_g: number;
          total_fat_g: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          total_kcal?: number;
          total_protein_g?: number;
          total_carbs_g?: number;
          total_fat_g?: number;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
