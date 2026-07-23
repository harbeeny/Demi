-- TestFlight and App Store builds register production-APNs tokens while
-- Xcode dev builds stay in the sandbox. A token only works on the host
-- matching the provisioning that minted it, so the sender must pick the
-- APNs host per token or one population silently loses push. Every
-- existing row came from a development build.
alter table public.device_tokens
  add column if not exists environment text not null default 'development'
  constraint device_tokens_environment_check
  check (environment in ('development', 'production'));
