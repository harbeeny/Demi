# Demi on iOS (Capacitor)

The web app ships inside a Capacitor 8 shell. The frontend is a static Next.js
export running in the WebView; every API call goes to the Vercel deployment
over HTTPS with a Supabase bearer token. One codebase, two targets:

- **Web**: `bun run build` (Vercel runs this; nothing changed).
- **iOS**: `bun run build:ios` = static export to `out/` + `cap sync ios`.
  The export refuses to run without `.env.local` and fails if the built
  bundle doesn't contain the Supabase host: NEXT_PUBLIC values bake in at
  build time, and a checkout missing them (fresh git worktrees) otherwise
  ships a bundle that hangs on every screen's loading gate on-device.

Login inside the app is the 6-digit email code or guest sign-in; there are no
magic-link redirects, so no deep-link or URL-scheme setup is needed.

## One-time machine setup

1. **Node 22+** for the Capacitor CLI: `fnm install 22` (already installed on
   this machine), then run cap commands with
   `fnm exec --using 22 npx cap <cmd>` or a Node 22 shell.
2. **Xcode 26+** from the Mac App Store (the Command Line Tools alone cannot
   build iOS apps). After installing:
   ```sh
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   sudo xcodebuild -license accept
   xcodebuild -downloadPlatform iOS   # simulator runtime
   ```
   No CocoaPods needed: Capacitor 8 uses Swift Package Manager.
3. **Apple Developer Program** ($99/year): enroll at
   [developer.apple.com/programs](https://developer.apple.com/programs/).
   Required for TestFlight and push notifications on a real device.
   Approval usually takes a day or two.

## Build and run

```sh
bun install
bun run build:ios        # static export + cap sync
npx cap open ios         # opens ios/App in Xcode (Node 22)
```

In Xcode, select the `App` target:
- **Signing & Capabilities** → set Team to your Apple Developer team; the
  bundle id is `com.hbeeny.demi` (change in `capacitor.config.ts` +
  re-sync if you want another; it must match an App ID registered to your
  team).
- Click **+ Capability → Push Notifications** (adds the `aps-environment`
  entitlement; automatic signing regenerates the profile).
- Run on a simulator (`npx cap run ios` also works). Push does not work on
  simulators; everything else does.

The API base URL is baked into the export at build time
(`NEXT_PUBLIC_API_BASE`, default `https://demi-gold.vercel.app` in
`scripts/build-ios.sh`). Point it at a preview deployment to test a branch.

## Push notifications (APNs)

Client and server are already built:
- The app registers on the Today screen (permission prompt → APNs token →
  `device_tokens` table, RLS owner-only).
- The `send-meal-reminders` Supabase Edge Function (deployed,
  `verify_jwt=false`, gated by an `x-cron-secret` header) sends
  "«Meal» in about 30 min" for plan slots 15-45 minutes out and a
  "How did today go?" nudge an hour after the eating window if the day isn't
  finished. Sends are deduped per user/day/kind in `push_sends`.

To activate once enrolled:

1. Apple Developer portal → **Keys** → create a key with
   **Apple Push Notifications service (APNs)** enabled. Download the `.p8`
   (one download only), note the **Key ID** and your **Team ID**.
2. Store the config. The function reads env vars first and falls back to
   Supabase Vault (via the service-role-only `public.get_push_secret()` rpc),
   so either works:
   - **Vault** (no CLI needed, SQL editor): `select vault.create_secret('<value>', 'push_apns_team_id');` and likewise for `push_apns_key_id`, `push_apns_p8` (base64 of the .p8 file), `push_bundle_id`, `push_apns_host`, `push_cron_secret`.
   - **Env secrets** (Supabase CLI): `supabase secrets set --project-ref syeoyutnlukrmijuumyt APNS_TEAM_ID=... APNS_KEY_ID=... APNS_P8="$(base64 -i AuthKey_XXXX.p8)" BUNDLE_ID=com.hbeeny.demi APNS_HOST=api.sandbox.push.apple.com CRON_SECRET="$(openssl rand -hex 32)"`

   `APNS_HOST`: `api.sandbox.push.apple.com` for Xcode-run development
   builds; **TestFlight builds use the production environment**, so switch to
   `api.push.apple.com` when testing via TestFlight.
3. Schedule the cron (Supabase SQL editor; store the same CRON_SECRET value):
   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;
   select vault.create_secret('<same CRON_SECRET value>', 'cron_secret');
   select cron.schedule(
     'send-meal-reminders', '*/15 * * * *',
     $$
     select net.http_post(
       url := 'https://syeoyutnlukrmijuumyt.supabase.co/functions/v1/send-meal-reminders',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
       ),
       body := '{}'::jsonb,
       timeout_milliseconds := 30000
     );
     $$
   );
   ```
4. Smoke test without waiting for cron:
   `curl -X POST -H "x-cron-secret: <value>" https://syeoyutnlukrmijuumyt.supabase.co/functions/v1/send-meal-reminders`
   → `{"ok":true,"sent":N,"pruned":N}`.

Known debt: reminder windows use UTC, matching the app's date handling. A
profile timezone column is the eventual fix.

## TestFlight

1. App Store Connect → **My Apps → + → New App**: platform iOS, bundle id
   `com.hbeeny.demi`, any SKU.
2. Xcode → **Product → Archive** (scheme `App`, destination "Any iOS
   Device"). When it finishes, the Organizer opens.
3. **Distribute App → App Store Connect → Upload**, automatic signing.
   Export compliance: the app only uses standard HTTPS, so
   `ITSAppUsesNonExemptEncryption = NO` is set in `ios/App/App/Info.plist`
   to skip the questionnaire.
4. In App Store Connect → TestFlight, add yourself as an internal tester;
   the build appears after processing (10-30 min). Install via the
   TestFlight app on your phone.

## App Store review, guideline 4.2

Apple rejects apps that are "a repackaged website" (guideline 4.2, minimum
functionality). This shell stays on the right side of it: native push
notifications that are actually used, a real onboarding flow, persistent
login, native splash/status-bar/safe-area integration, and no browser chrome
or URL loading at runtime (the bundle ships on-device). Keep it that way when
adding features; the Phase 6 native rewrite is the long-term answer.

Two more product notes before shipping broadly:
- **Guest accounts are device-bound**: deleting the app orphans an anonymous
  session's data. Offer email linking (`supabase.auth.updateUser`) first.
- An offline/error state in the WebView (rather than a blank screen in
  Airplane Mode) is a common 4.2 reviewer check.
