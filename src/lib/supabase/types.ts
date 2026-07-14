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

export type Budget = "low" | "medium" | "high";

export type CookingSkill = "minimal" | "basic" | "confident";

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export type MealLogSource = "planned" | "db" | "estimate";

export type PlanEvent = "regenerated" | "swapped" | "rebalanced";

export interface MealPlanEntry {
  meal_id: string;
  slot: MealSlot;
  servings: number;
  /** hour of day as decimal, e.g. 12.5 = 12:30 */
  time_hour?: number;
  /** one-line LLM (or fallback) explanation for this meal */
  why?: string;
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
        Relationships: [];
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
          goal_rate: number | null;
          activity_level: ActivityLevel;
          dietary_prefs: string[];
          allergies: string[];
          dislikes: string[];
          budget: Budget;
          cooking_skill: CookingSkill;
          meals_per_day: number;
          eating_window_start: number;
          eating_window_end: number;
          training_days: string[];
          training_time: string | null;
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
          goal_rate?: number | null;
          activity_level: ActivityLevel;
          dietary_prefs?: string[];
          allergies?: string[];
          dislikes?: string[];
          budget?: Budget;
          cooking_skill?: CookingSkill;
          meals_per_day?: number;
          eating_window_start?: number;
          eating_window_end?: number;
          training_days?: string[];
          training_time?: string | null;
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
          goal_rate?: number | null;
          activity_level?: ActivityLevel;
          dietary_prefs?: string[];
          allergies?: string[];
          dislikes?: string[];
          budget?: Budget;
          cooking_skill?: CookingSkill;
          meals_per_day?: number;
          eating_window_start?: number;
          eating_window_end?: number;
          training_days?: string[];
          training_time?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      plan_events: {
        Row: {
          id: string;
          user_id: string;
          plan_id: string;
          event: PlanEvent;
          meal_slot: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          plan_id: string;
          event: PlanEvent;
          meal_slot?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          plan_id?: string;
          event?: PlanEvent;
          meal_slot?: string | null;
          created_at?: string;
        };
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
          energy: number | null;
          day_note: string | null;
          reflection: string | null;
          tweak: string | null;
          finished_at: string | null;
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
          energy?: number | null;
          day_note?: string | null;
          reflection?: string | null;
          tweak?: string | null;
          finished_at?: string | null;
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
          energy?: number | null;
          day_note?: string | null;
          reflection?: string | null;
          tweak?: string | null;
          finished_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      device_tokens: {
        Row: {
          id: string;
          user_id: string;
          token: string;
          platform: "ios" | "android";
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          token: string;
          platform?: "ios" | "android";
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          token?: string;
          platform?: "ios" | "android";
          updated_at?: string;
        };
        Relationships: [];
      };
      push_sends: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          kind: string;
          sent_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          kind: string;
          sent_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          kind?: string;
          sent_at?: string;
        };
        Relationships: [];
      };
      meal_logs: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          slot: MealSlot | null;
          plan_slot_index: number | null;
          meal_id: string | null;
          name: string;
          kcal: number;
          protein_g: number;
          carbs_g: number;
          fat_g: number;
          source: MealLogSource;
          note: string | null;
          logged_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          slot?: MealSlot | null;
          plan_slot_index?: number | null;
          meal_id?: string | null;
          name: string;
          kcal: number;
          protein_g: number;
          carbs_g: number;
          fat_g: number;
          source: MealLogSource;
          note?: string | null;
          logged_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          slot?: MealSlot | null;
          plan_slot_index?: number | null;
          meal_id?: string | null;
          name?: string;
          kcal?: number;
          protein_g?: number;
          carbs_g?: number;
          fat_g?: number;
          source?: MealLogSource;
          note?: string | null;
          logged_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
