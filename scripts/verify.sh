#!/usr/bin/env bash
# Everything that must be green before calling the app done.
# Assumes the built app is served on $APP_URL (default http://localhost:3000).
set -uo pipefail
cd "$(dirname "$0")/.."
export APP_URL="${APP_URL:-http://localhost:3000}"
export SHOT_URL="${SHOT_URL:-$APP_URL/}"
fail=0
run() { # name, command...
  local name="$1"; shift
  echo "──────── $name"
  if "$@"; then echo "  ✔ $name"; else echo "  ✘ $name"; fail=$((fail+1)); fi
}
node build.mjs || { echo "build failed"; exit 1; }
run "rules unit + oracle (7776 rolls)" node --test tests/rules.test.js tests/rules-oracle.test.js
run "contract suite"                    npx playwright test
run "own visual audit"                  npx playwright test --config playwright.audit.config.ts
run "layout fit (3p/8p, both phones, both dice modes)" node scripts/fitturn.mjs
run "keypad faces, counted pixel by pixel" node scripts/keypad.mjs
run "hand-over note and Undo label"     node scripts/handover.mjs
run "sub-path hosting"                  node scripts/subpath.mjs
run "offline + home screen"             node scripts/offline.mjs
run "service worker update path"        node scripts/swupdate.mjs
run "interaction hazards"               node scripts/interactions.mjs
run "session boundaries"                node scripts/session-reset.mjs
run "edge cases (undo, 8p, reduced motion)" node scripts/edge.mjs
run "three whole games vs the engine"   node scripts/longgame.mjs
run "real-dice mode: whole games, Joker, undo, mode switch" node scripts/realdice.mjs
echo
if [ "$fail" -eq 0 ]; then echo "ALL GREEN ($APP_URL)"; else echo "$fail GROUP(S) FAILED"; fi
exit "$fail"
