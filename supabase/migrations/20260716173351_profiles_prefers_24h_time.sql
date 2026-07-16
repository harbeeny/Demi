-- Whether the user's device clock runs 24-hour time, captured from the
-- device like profiles.timezone. Server-baked plan copy (meal "why" lines,
-- which push reminders reuse) formats meal times with it; null means
-- unknown and falls back to 12-hour, the app's default voice.
alter table public.profiles add column if not exists prefers_24h_time boolean;
