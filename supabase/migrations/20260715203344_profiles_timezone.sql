-- IANA timezone captured from the user's device; the server derives each
-- user's local "today" and meal-reminder hours from it. Null falls back to UTC.
alter table public.profiles add column if not exists timezone text;
