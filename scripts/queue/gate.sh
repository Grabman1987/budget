#!/usr/bin/env bash
# Merge gate (fails closed): exit 0 only if origin/main's head passed ci.yml and deploy.yml and is the
# live /health revision (or contained in it). Anything else, including every gh/curl/git error, exits 1
# with a one-line "BLOCK: reason". Read-only. Usage: gate.sh
set -uo pipefail
command -v gh >/dev/null || export PATH="$PATH:/c/Program Files/GitHub CLI"
export GH_REPO=${GH_REPO:-Grabman1987/budget}
HERE=$(cd "$(dirname "$0")" && pwd)
HEALTH=https://budget-fg.fly.dev/health

block() { echo "BLOCK: $*"; exit 1; }
RUN_FIELDS=headSha,status,conclusion

git -C "$HERE" fetch -q origin main 2>/dev/null || block "git fetch origin main failed"
head=$(git -C "$HERE" rev-parse --verify -q origin/main) || block "origin/main head unknown"
ci=$(gh run list --workflow=ci.yml --branch main --event push --commit "$head" -L 1 --json $RUN_FIELDS --jq '.[0] // null' 2>/dev/null) ||
  block "gh run list ci.yml failed"
deploy=$(gh run list --workflow=deploy.yml --branch main --commit "$head" -L 1 --json $RUN_FIELDS --jq '.[0] // null' 2>/dev/null) ||
  block "gh run list deploy.yml failed"

# An empty gh answer (e.g. no deploy.yml run yet) becomes null below, so the policy names the real reason.
# Only plain tokens are copied out of the health body, so nothing can break the JSON built below.
body=$(curl -fsS -m 20 "$HEALTH" 2>/dev/null) || block "health unreachable ($HEALTH)"
field() { sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([A-Za-z0-9._-]*\)\".*/\1/p" <<<"$body" | head -n1; }
status=$(field status) rev=$(field revision)
anc=false
[ -n "$rev" ] && [ "$rev" != "$head" ] && git -C "$HERE" merge-base --is-ancestor "$head" "$rev" 2>/dev/null && anc=true

printf '{"mainHead":"%s","ciRun":%s,"deployRun":%s,"health":{"status":"%s","revision":"%s","ancestor":%s}}' \
  "$head" "${ci:-null}" "${deploy:-null}" "$status" "$rev" "$anc" | node "$HERE/policy.mjs" gate
