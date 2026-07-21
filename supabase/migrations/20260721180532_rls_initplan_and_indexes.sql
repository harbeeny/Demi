-- Backend responsiveness pass, DB half.
--
-- 1) RLS initplan: every owner-scoped policy compared auth.uid() per ROW,
--    which the planner cannot hoist. Wrapping it in a scalar subquery makes
--    it an InitPlan evaluated once per statement. Semantics are identical
--    (auth.uid() is stable within a statement); only the plan changes.
--    This clears every auth_rls_initplan advisor warning.
--
-- 2) Missing indexes on hot paths: onboarding_answers is read by user_id
--    on every tab load and had zero usable index (18k+ seq scans);
--    meal_logs.meal_id and plan_events FKs were unindexed.

-- daily_logs
alter policy "Users can read their own logs" on public.daily_logs
  using ((select auth.uid()) = user_id);
alter policy "Users can insert their own logs" on public.daily_logs
  with check ((select auth.uid()) = user_id);
alter policy "Users can update their own logs" on public.daily_logs
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- day_adjustments
alter policy "day_adjustments_select_own" on public.day_adjustments
  using ((select auth.uid()) = user_id);
alter policy "day_adjustments_insert_own" on public.day_adjustments
  with check ((select auth.uid()) = user_id);
alter policy "day_adjustments_delete_own" on public.day_adjustments
  using ((select auth.uid()) = user_id);

-- device_tokens
alter policy "Users manage their own device tokens" on public.device_tokens
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- food_search_cache
alter policy "food_search_cache_select_own" on public.food_search_cache
  using ((select auth.uid()) = user_id);
alter policy "food_search_cache_insert_own" on public.food_search_cache
  with check ((select auth.uid()) = user_id);
alter policy "food_search_cache_update_own" on public.food_search_cache
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "food_search_cache_delete_own" on public.food_search_cache
  using ((select auth.uid()) = user_id);

-- jobs
alter policy "jobs_select_own" on public.jobs
  using ((select auth.uid()) = user_id);
alter policy "jobs_insert_own" on public.jobs
  with check ((select auth.uid()) = user_id);
alter policy "jobs_update_own" on public.jobs
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- meal_logs
alter policy "Users can read their own meal logs" on public.meal_logs
  using ((select auth.uid()) = user_id);
alter policy "Users can insert their own meal logs" on public.meal_logs
  with check ((select auth.uid()) = user_id);
alter policy "Users can update their own meal logs" on public.meal_logs
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "Users can delete their own meal logs" on public.meal_logs
  using ((select auth.uid()) = user_id);

-- meal_plans
alter policy "Users can read their own plans" on public.meal_plans
  using ((select auth.uid()) = user_id);
alter policy "Users can insert their own plans" on public.meal_plans
  with check ((select auth.uid()) = user_id);
alter policy "Users can update their own plans" on public.meal_plans
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- onboarding_answers
alter policy "Users can read their own answers" on public.onboarding_answers
  using ((select auth.uid()) = user_id);
alter policy "Users can insert their own answers" on public.onboarding_answers
  with check ((select auth.uid()) = user_id);
alter policy "Users can update their own answers" on public.onboarding_answers
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- plan_cache
alter policy "plan_cache_select_own" on public.plan_cache
  using ((select auth.uid()) = user_id);
alter policy "plan_cache_insert_own" on public.plan_cache
  with check ((select auth.uid()) = user_id);
alter policy "plan_cache_delete_own" on public.plan_cache
  using ((select auth.uid()) = user_id);

-- plan_events
alter policy "Users can read their own plan events" on public.plan_events
  using ((select auth.uid()) = user_id);
alter policy "Users can insert their own plan events" on public.plan_events
  with check ((select auth.uid()) = user_id);

-- profiles (owner column is id)
alter policy "Users can read their own profile" on public.profiles
  using ((select auth.uid()) = id);
alter policy "Users can update their own profile" on public.profiles
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- target_adjustments
alter policy "Users can read their own adjustments" on public.target_adjustments
  using ((select auth.uid()) = user_id);
alter policy "Users can insert their own adjustments" on public.target_adjustments
  with check ((select auth.uid()) = user_id);
alter policy "Users can update their own adjustments" on public.target_adjustments
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- usage_events
alter policy "usage_events_select_own" on public.usage_events
  using ((select auth.uid()) = user_id);
alter policy "usage_events_insert_own" on public.usage_events
  with check ((select auth.uid()) = user_id);

-- weight_logs
alter policy "Users can read their own weigh-ins" on public.weight_logs
  using ((select auth.uid()) = user_id);
alter policy "Users can insert their own weigh-ins" on public.weight_logs
  with check ((select auth.uid()) = user_id);
alter policy "Users can update their own weigh-ins" on public.weight_logs
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Hot-path and FK indexes. The onboarding lookup is the app's most frequent
-- query (every tab load: newest row per user).
create index if not exists onboarding_answers_user_created_idx
  on public.onboarding_answers (user_id, created_at desc);
create index if not exists meal_logs_meal_id_idx
  on public.meal_logs (meal_id);
create index if not exists plan_events_plan_id_idx
  on public.plan_events (plan_id);
create index if not exists plan_events_user_id_idx
  on public.plan_events (user_id);
