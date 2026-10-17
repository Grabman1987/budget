#!/usr/bin/env bash
# Closes issues of merged agent PRs once the merge commit is live (contained in the deployed
# /health revision) and sets the board to "Live". Exit 2 = STOP (latest main CI/deploy failed).
# Any error (gh, curl, unhealthy answer, unknown commit) means "do not close", never "close".
# Usage: live.sh [--dry-run]
set -uo pipefail

DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1
HERE=$(cd "$(dirname "$0")" && pwd)
HEALTH=https://budget-fg.fly.dev/health

for wf in ci.yml deploy.yml; do
  c=$(gh run list --workflow="$wf" --branch main -L 1 --json conclusion --jq '.[0].conclusion // empty' 2>/dev/null) ||
    { echo "live: cannot read $wf runs, skipping"; exit 0; }
  case "$c" in failure | timed_out)
    echo "STOP: latest main run of $wf is $c"
    exit 2
    ;;
  esac
done

body=$(curl -fsS -m 20 "$HEALTH" 2>/dev/null)
rev=$(sed -n 's/.*"revision"[[:space:]]*:[[:space:]]*"\([0-9a-f]\{40\}\)".*/\1/p' <<<"$body")
{ [ -n "$rev" ] && grep -q '"status"[[:space:]]*:[[:space:]]*"ok"' <<<"$body"; } ||
  { echo "live: no healthy revision from $HEALTH, skipping"; exit 0; }
git fetch -q origin main 2>/dev/null

merged=$(gh pr list --state merged --limit 20 --json number,headRefName,mergeCommit \
  --jq '.[] | select(.headRefName | test("^(agent|codex)/issue-[0-9]+$")) | [.headRefName, .mergeCommit.oid] | @tsv') ||
  { echo "live: gh pr list failed, skipping"; exit 0; }
merged=$(tr -d '\r' <<<"$merged")

while IFS=$'\t' read -r head mc; do
  [ -z "${head:-}" ] && continue
  n=${head##*-}
  [ "$(gh issue view "$n" --json state --jq .state 2>/dev/null)" = OPEN ] || continue
  [[ "$mc" =~ ^[0-9a-f]{40}$ ]] || { echo "#$n: merged, merge commit unknown"; continue; }
  if git merge-base --is-ancestor "$mc" "$rev" 2>/dev/null; then
    if [ "$DRY" = 1 ]; then echo "#$n: would close (live in ${rev:0:7})"; continue; fi
    gh issue close "$n" --comment "Live in ${rev:0:7}" >/dev/null 2>&1 || { echo "#$n: close failed"; continue; }
    bash "$HERE/board.sh" "$n" "Live" >/dev/null 2>&1 || echo "warn: board $n Live failed" >&2
    echo "#$n: live in ${rev:0:7}, closed"
  else
    echo "#$n: merged, not live yet (deployed ${rev:0:7})"
  fi
done <<<"$merged"
exit 0
