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

export type MealLogSource = "planned" | "db" | "estimate" | "fdc";

export type PlanEvent = "regenerated" | "swapped" | "rebalanced";

export type TakeoutProvider = "doordash" | "ubereats";

export type NotificationIntensity = "coach" | "checkin" | "quiet";

export type NotificationOutcome =
  | "pending"
  | "opened"
  | "action_taken"
  | "ignored"
  | "suppressed";

export type TakeoutSurface = "today_screen" | "lazy_empty_state";

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
          timezone: string | null;
          prefers_24h_time: boolean | null;
          takeout_region: Json | null;
          notification_intensity: NotificationIntensity | null;
          quiet_hours_start: number | null;
          quiet_hours_end: number | null;
        };
        Insert: {
          id: string;
          created_at?: string;
          onboarding_complete?: boolean;
          timezone?: string | null;
          prefers_24h_time?: boolean | null;
          takeout_region?: Json | null;
          notification_intensity?: NotificationIntensity | null;
          quiet_hours_start?: number | null;
          quiet_hours_end?: number | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          onboarding_complete?: boolean;
          timezone?: string | null;
          prefers_24h_time?: boolean | null;
          takeout_region?: Json | null;
          notification_intensity?: NotificationIntensity | null;
          quiet_hours_start?: number | null;
          quiet_hours_end?: number | null;
        };
        Relationships: [];
      };
      notification_kills: {
        Row: {
          user_id: string;
          family: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          family: string;
          created_at?: string;
        };
        // permanent by design: no update or delete grant exists
        Update: {
          user_id?: never;
          family?: never;
          created_at?: never;
        };
        Relationships: [];
      };
      notification_events: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          kind: string;
          fired_at: string | null;
          outcome: NotificationOutcome;
          action: string | null;
          suppression_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          kind: string;
          fired_at?: string | null;
          outcome?: NotificationOutcome;
          action?: string | null;
          suppression_reason?: string | null;
          created_at?: string;
        };
        Update: {
          // device-side updates are column-granted to outcome and action only
          outcome?: NotificationOutcome;
          action?: string | null;
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
          body_fat_pct: number | null;
          tried_tracking_apps: boolean | null;
          blockers: string[];
          protein_pref: "low" | "moderate" | "high" | "extra_high" | null;
          calorie_distribution: "shift" | "even" | null;
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
          tdee_correction: number | null;
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
          body_fat_pct?: number | null;
          tried_tracking_apps?: boolean | null;
          blockers?: string[];
          protein_pref?: "low" | "moderate" | "high" | "extra_high" | null;
          calorie_distribution?: "shift" | "even" | null;
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
          tdee_correction?: number | null;
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
          body_fat_pct?: number | null;
          tried_tracking_apps?: boolean | null;
          blockers?: string[];
          protein_pref?: "low" | "moderate" | "high" | "extra_high" | null;
          calorie_distribution?: "shift" | "even" | null;
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
          tdee_correction?: number | null;
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
          ingredients: Json;
          instructions: string[];
          prep_min: number;
          cook_min: number;
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
          ingredients?: Json;
          instructions?: string[];
          prep_min?: number;
          cook_min?: number;
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
          ingredients?: Json;
          instructions?: string[];
          prep_min?: number;
          cook_min?: number;
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
      weight_logs: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          weight_kg: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          weight_kg: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          weight_kg?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      target_adjustments: {
        Row: {
          id: string;
          user_id: string;
          status: "proposed" | "accepted" | "dismissed";
          correction_delta: number;
          new_correction: number;
          window_stats: Json;
          rationale: string;
          created_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          status?: "proposed" | "accepted" | "dismissed";
          correction_delta: number;
          new_correction: number;
          window_stats?: Json;
          rationale: string;
          created_at?: string;
          resolved_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          status?: "proposed" | "accepted" | "dismissed";
          correction_delta?: number;
          new_correction?: number;
          window_stats?: Json;
          rationale?: string;
          created_at?: string;
          resolved_at?: string | null;
        };
        Relationships: [];
      };
      device_tokens: {
        Row: {
          id: string;
          user_id: string;
          token: string;
          platform: "ios" | "android";
          environment: "development" | "production";
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          token: string;
          platform?: "ios" | "android";
          environment?: "development" | "production";
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          token?: string;
          platform?: "ios" | "android";
          environment?: "development" | "production";
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
          fdc_id: number | null;
          verified: boolean;
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
          fdc_id?: number | null;
          verified?: boolean;
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
          fdc_id?: number | null;
          verified?: boolean;
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
      usage_events: {
        Row: {
          id: string;
          user_id: string;
          kind: string;
          model: string;
          input_tokens: number;
          output_tokens: number;
          est_cost_usd: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          kind: string;
          model: string;
          input_tokens: number;
          output_tokens: number;
          est_cost_usd: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          kind?: string;
          model?: string;
          input_tokens?: number;
          output_tokens?: number;
          est_cost_usd?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      takeout_intent_events: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          provider: TakeoutProvider;
          meal_id: string | null;
          dish_query: string;
          had_macro_match: boolean;
          goal: Goal | null;
          surface: TakeoutSurface;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
          provider: TakeoutProvider;
          meal_id?: string | null;
          dish_query: string;
          had_macro_match: boolean;
          goal?: Goal | null;
          surface: TakeoutSurface;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          provider?: TakeoutProvider;
          meal_id?: string | null;
          dish_query?: string;
          had_macro_match?: boolean;
          goal?: Goal | null;
          surface?: TakeoutSurface;
        };
        Relationships: [];
      };
      user_takeout_prefs: {
        Row: {
          user_id: string;
          chain_name: string;
          affinity: "liked" | "hidden";
          source: "picker" | "inferred" | "favorited";
          updated_at: string;
        };
        Insert: {
          user_id: string;
          chain_name: string;
          affinity?: "liked" | "hidden";
          source?: "picker" | "inferred" | "favorited";
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          chain_name?: string;
          affinity?: "liked" | "hidden";
          source?: "picker" | "inferred" | "favorited";
          updated_at?: string;
        };
        Relationships: [];
      };
      app_config: {
        Row: {
          key: string;
          value: Json;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: Json;
          updated_at?: string;
        };
        Update: {
          key?: string;
          value?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      plan_cache: {
        Row: {
          user_id: string;
          key: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          user_id: string;
          key: string;
          payload: Json;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          key?: string;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      jobs: {
        Row: {
          id: string;
          user_id: string;
          kind: string;
          payload: Json;
          status: string;
          attempts: number;
          claimed_at: string | null;
          finished_at: string | null;
          error: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          kind: string;
          payload?: Json;
          status?: string;
          attempts?: number;
          claimed_at?: string | null;
          finished_at?: string | null;
          error?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          kind?: string;
          payload?: Json;
          status?: string;
          attempts?: number;
          claimed_at?: string | null;
          finished_at?: string | null;
          error?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      food_search_cache: {
        Row: {
          user_id: string;
          query_key: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          user_id: string;
          query_key: string;
          payload: Json;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          query_key?: string;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      pantry_items: {
        Row: {
          user_id: string;
          item: string;
          unit: string;
          qty: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          item: string;
          unit: string;
          qty?: number;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          item?: string;
          unit?: string;
          qty?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      pantry_state: {
        Row: {
          user_id: string;
          consumed_until: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          consumed_until: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          consumed_until?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      day_adjustments: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          kcal_delta: number;
          source_date: string;
          reason: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          kcal_delta: number;
          source_date: string;
          reason?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          kcal_delta?: number;
          source_date?: string;
          reason?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      consume_quota: {
        Args: { p_bucket: string; p_limit: number };
        Returns: boolean;
      };
      pantry_add: {
        Args: { p_item: string; p_unit: string; p_delta: number };
        Returns: undefined;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
