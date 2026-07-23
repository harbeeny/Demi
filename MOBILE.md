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
   this machine). `bun run build:ios` finds it through fnm automatically when
   the shell default is older; only manual `npx cap <cmd>` invocations need
   `fnm exec --using 22` or a Node 22 shell.
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
   - **Vault** (no CLI needed, SQL editor): `select vault.create_secret('<value>', 'push_apns_team_id');` and likewise for `push_apns_key_id`, `push_apns_p8` (base64 of the .p8 file), `push_bundle_id`, `push_cron_secret`.
   - **Env secrets** (Supabase CLI): `supabase secrets set --project-ref syeoyutnlukrmijuumyt APNS_TEAM_ID=... APNS_KEY_ID=... APNS_P8="$(base64 -i AuthKey_XXXX.p8)" BUNDLE_ID=com.hbeeny.demi CRON_SECRET="$(openssl rand -hex 32)"`

   **APNs host is not config anymore.** The sender derives it per token
   from `device_tokens.environment`: dev builds register development
   tokens (sandbox host) and TestFlight/App Store builds register
   production tokens (production host), so both build types receive push
   side by side. The client stamps the environment from
   `NEXT_PUBLIC_APNS_ENV` at export time: leave it unset for dev builds;
   the archive recipe below sets `NEXT_PUBLIC_APNS_ENV=production`. A
   legacy `push_apns_host` vault secret is simply unread.
3. Schedule the cron (Supabase SQL editor; store the same CRON_SECRET value):
   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;
   select vault.create_secret('<same CRON_SECRET value>', 'push_cron_secret');
   select cron.schedule(
     'send-meal-reminders', '*/15 * * * *',
     $$
     select net.http_post(
       url := 'https://syeoyutnlukrmijuumyt.supabase.co/functions/v1/send-meal-reminders',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')
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

## TestFlight (fully headless)

One-time setup, already done on this Mac (redo only on a new machine):
- App Store Connect record exists (bundle `com.hbeeny.demi`).
- App Store Connect **API key**, Admin role, at
  `~/.appstoreconnect/private_keys/AuthKey_<KEYID>.p8` (never in the repo;
  `*.p8` is gitignored). Current key id: `QG83V7X8ZJ`; issuer
  `299f02b5-fa71-4221-a43c-cb763a5f8430`.
- A local **Apple Distribution** certificate (Xcode → Settings → Accounts →
  Manage Certificates → +) paired with the manual portal profile
  **"Demi App Store Manual"** (App Store type, `com.hbeeny.demi`, that
  certificate) installed under `~/Library/MobileDevice/Provisioning
  Profiles/`. Both renew annually; on "doesn't include signing
  certificate" errors, re-download the profile after checking it lists the
  local cert (identify certs by downloading the .cer and fingerprinting;
  the portal UI hides serials, and identically-named entries lie).
  Deliberately NOT cloud signing: xcodebuild's CLI cloud path proved
  unreliable; local cert + manual profile is deterministic.

Ship a build (N = next build number; App Store Connect requires unique):

```bash
NEXT_PUBLIC_APNS_ENV=production bun run build:ios
cd ios/App && xcodebuild archive -project App.xcodeproj -scheme App \
  -destination 'generic/platform=iOS' -allowProvisioningUpdates \
  CURRENT_PROJECT_VERSION=N \
  -archivePath ~/Library/Developer/Xcode/Archives/$(date +%Y-%m-%d)/Demi-N.xcarchive
xcodebuild -exportArchive \
  -archivePath ~/Library/Developer/Xcode/Archives/$(date +%Y-%m-%d)/Demi-N.xcarchive \
  -exportOptionsPlist ../../scripts/ExportOptions.plist \
  -exportPath /tmp/demi-export-N \
  -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_QG83V7X8ZJ.p8 \
  -authenticationKeyID QG83V7X8ZJ \
  -authenticationKeyIssuerID 299f02b5-fa71-4221-a43c-cb763a5f8430
```

The `NEXT_PUBLIC_APNS_ENV=production` flag makes the install register its
push token as `production` in `device_tokens`; without it the token lands
in the sandbox row and TestFlight push goes nowhere. Dev installs over USB
keep using plain `bun run build:ios`. Export compliance is pre-answered
(`ITSAppUsesNonExemptEncryption = NO` in Info.plist), and the Internal
group has automatic distribution, so a build is installable from the
TestFlight app ~10-30 min after upload with no console clicks.

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
