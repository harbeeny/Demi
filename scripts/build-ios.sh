#!/usr/bin/env bash
# Static export for the Capacitor shell. Next.js `output: "export"` rejects
# API route handlers, the auth/confirm route, and middleware, so those move
# aside for the duration of the build and are ALWAYS restored (trap), even on
# failure. The Vercel build never runs this script and is unaffected.
set -euo pipefail

cd "$(dirname "$0")/.."

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

echo "Static bundle in ./out"
