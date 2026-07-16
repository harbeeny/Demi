#!/usr/bin/env bash
# Static export for the Capacitor shell. Next.js `output: "export"` rejects
# API route handlers, the auth/confirm route, and middleware, so those move
# aside for the duration of the build and are ALWAYS restored (trap), even on
# failure. The Vercel build never runs this script and is unaffected.
set -euo pipefail

cd "$(dirname "$0")/.."

# Device bundles bake NEXT_PUBLIC_* values in at build time. A checkout
# without .env.local (fresh git worktrees: gitignored files don't exist
# there) builds and installs cleanly, then every screen hangs on its
# loading gate because the Supabase client has no config. Refuse early.
if [ ! -f .env.local ]; then
  echo "error: no .env.local in $(pwd)" >&2
  echo "A bundle built here would ship without Supabase config and hang on-device." >&2
  echo "Run the export from the main checkout, or provision this checkout's env first." >&2
  exit 1
fi
SUPA_HOST="$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | head -1 | sed -E 's~[^=]*=~~; s~^["'"'"']?https?://~~; s~[/"'"'"'].*$~~')"
if [ -z "$SUPA_HOST" ]; then
  echo "error: NEXT_PUBLIC_SUPABASE_URL missing from .env.local; the bundle would be unusable on-device." >&2
  exit 1
fi

API_BASE="${NEXT_PUBLIC_API_BASE:-https://demi-gold.vercel.app}"
STASH=".capacitor-build-stash"
MOVED=()

restore() {
  for entry in "${MOVED[@]-}"; do
    [ -z "$entry" ] && continue
    src="${entry%%=>*}"
    dst="${entry##*=>}"
    mv "$dst" "$src"
  done
  rmdir "$STASH" 2>/dev/null || true
}
trap restore EXIT

mkdir -p "$STASH"
move_aside() {
  local path="$1" name
  [ -e "$path" ] || return 0
  name="$(echo "$path" | tr '/' '_')"
  mv "$path" "$STASH/$name"
  MOVED+=("$path=>$STASH/$name")
}

move_aside src/app/api
move_aside src/app/auth
move_aside src/middleware.ts

echo "Building static export against API base: $API_BASE"
BUILD_TARGET=capacitor NEXT_PUBLIC_API_BASE="$API_BASE" bunx next build

# Belt and suspenders: prove the config actually got inlined before this
# bundle can reach cap sync and a device.
if ! grep -rq "$SUPA_HOST" out/_next/static/chunks/; then
  echo "error: built bundle does not reference $SUPA_HOST; Supabase env was not baked in." >&2
  exit 1
fi

echo "Static bundle in ./out"
