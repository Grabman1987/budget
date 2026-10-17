#!/usr/bin/env bash
# Closes the issue of a merged agent PR (branch agent|codex/issue-N, never a parent or epic it merely
# mentions) once the merge commit is live (contained in the deployed /health revision) AND the PR carries
# the label queue:complete (set by the orchestrator after every acceptance criterion is verified). Without
# the label it comments once per PR ("open items remain") and moves the board to "CI / Review".
# Exit 2 = STOP (latest main CI/deploy failed).
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

merged=$(gh pr list --state merged --limit 20 --json number,headRefName,mergeCommit,labels \
  --jq '.[] | select(.headRefName | test("^(agent|codex)/issue-[0-9]+$")) | [.headRefName, .mergeCommit.oid, any(.labels[]; .name == "queue:complete"), .number] | @tsv') ||
  { echo "live: gh pr list failed, skipping"; exit 0; }
merged=$(tr -d '\r' <<<"$merged")

while IFS=$'\t' read -r head mc complete pr; do
  [ -z "${head:-}" ] && continue
  n=${head##*-} # only the PR's own issue (from its branch name); "Part of #N" / parents / epics are never touched
  [ "$(gh issue view "$n" --json state --jq .state 2>/dev/null)" = OPEN ] || continue
  [[ "$mc" =~ ^[0-9a-f]{40}$ ]] || { echo "#$n: merged, merge commit unknown"; continue; }
  if git merge-base --is-ancestor "$mc" "$rev" 2>/dev/null; then
    if [ "${complete:-}" != true ]; then # live but not verified complete: never close, tell the issue once per PR
      [[ "${pr:-}" =~ ^[0-9]+$ ]] || continue
      if [ "$DRY" = 1 ]; then echo "#$n: live in ${rev:0:7}, open items remain (would comment once)"; continue; fi
      c=$(gh issue view "$n" --json comments --jq '.comments[].body' 2>/dev/null) || { echo "#$n: comments unreadable, skipping"; continue; }
      grep -q "queue-live-pr-$pr " <<<"$c" && continue
      gh issue comment "$n" --body "<!-- queue-live-pr-$pr -->
Live in ${rev:0:7}; open items remain, issue stays open" >/dev/null 2>&1 || { echo "#$n: comment failed"; continue; }
      bash "$HERE/board.sh" "$n" "CI / Review" >/dev/null 2>&1 || echo "warn: board $n CI / Review failed" >&2
      echo "#$n: live in ${rev:0:7}, open items remain (no queue:complete), left open"
      continue
    fi
    if [ "$DRY" = 1 ]; then echo "#$n: would close (live in ${rev:0:7})"; continue; fi
    gh issue close "$n" --comment "Live in ${rev:0:7}" >/dev/null 2>&1 || { echo "#$n: close failed"; continue; }
    bash "$HERE/board.sh" "$n" "Live" >/dev/null 2>&1 || echo "warn: board $n Live failed" >&2
    echo "#$n: live in ${rev:0:7}, closed"
  else
    echo "#$n: merged, not live yet (deployed ${rev:0:7})"
  fi
done <<<"$merged"
exit 0
