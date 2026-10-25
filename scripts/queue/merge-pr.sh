#!/usr/bin/env bash
# merge-pr.sh <pr> - orchestrator helper, the only merge path in use (see docs/queue/README.md).
# Runs locally under the owner's gh login. Steps:
#   1. wait until main is green (ci.yml + deploy.yml for the main head) and /health serves that head;
#   2. update the PR branch once if it is behind main;
#   3. wait for ci.yml on the exact PR head, re-check the gate and that main did not move;
#   4. squash-merge with --match-head-commit, then wait until the merge commit is live.
# One merge per live revision. Exit: 0 live, 1 stopped before merge, 2 main CI failed after merge,
# 3 not live after 45 min. git fetch and gh reads are retried up to 3 times (e.g. "cannot lock ref").
set -uo pipefail
export PATH="$PATH:/c/Program Files/GitHub CLI" GH_REPO=Grabman1987/budget
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)" || exit 1
pr=$1
retry() { # up to 3 tries with a short sleep for transient git/gh errors
  local i; for i in 1 2 3; do "$@" && return 0; [ "$i" -lt 3 ] && sleep 5; done; return 1
}
log() { echo "$(date +%H:%M:%S) #$pr $*"; }
health() { curl -fsS -m 15 https://budget-fg.fly.dev/health | sed -n 's/.*"revision":"\([0-9a-f]*\)".*/\1/p'; }
wait_ci() { # $1 sha -> 0 green, 1 red
  local id=""
  for _ in $(seq 1 30); do id=$(gh run list --workflow=ci.yml --commit "$1" -L 1 --json databaseId -q '.[0].databaseId' 2>/dev/null); [ -n "$id" ] && break; sleep 20; done
  [ -z "$id" ] && { log "no CI run for ${1:0:8}"; return 1; }
  gh run watch "$id" --exit-status >/dev/null 2>&1 && return 0
  log "CI red ${1:0:8} run $id: $(gh run view "$id" --log-failed 2>/dev/null | grep -oE '\[[a-z-]+\] › e2e/[^ ]+|FAIL [^ ]+' | sort -u | head -5 | tr '\n' ' ')"
  return 1
}
gate_ok() { # main CI + deploy success for main head and live == main head
  retry git fetch -q origin main || return 1
  local h; h=$(git rev-parse origin/main)
  [ "$(gh run list --workflow=ci.yml --branch main -L 1 --json headSha,conclusion -q '.[0].headSha+" "+.[0].conclusion')" = "$h success" ] || return 1
  # Audits can trigger an entirely skipped Deploy run. It is not a deployment attempt;
  # keep the newest actual attempt (including pending, failed or cancelled attempts).
  [ "$(gh run list --workflow=deploy.yml -L 50 --json headSha,conclusion -q '[.[] | select(.conclusion != "skipped")][0] | .headSha+" "+.conclusion')" = "$h success" ] || return 1
  [ "$(health)" = "$h" ] || return 1
  echo "$h"
}
until main=$(gate_ok); do log "gate: main not live/green yet"; sleep 60; done
is_sha() { [[ "$1" =~ ^[0-9a-f]{40}$ ]]; }
pr_head() { retry gh pr view "$pr" --json headRefOid -q .headRefOid; }
head=$(pr_head) && is_sha "$head" || { log "cannot read PR head, stop"; exit 1; }
retry git fetch -q origin "pull/$pr/head" || { log "cannot fetch PR head, stop"; exit 1; }
if ! git merge-base --is-ancestor "$main" "$head"; then
  log "behind main, updating once"
  gh api -X PUT "repos/Grabman1987/budget/pulls/$pr/update-branch" -f expected_head_sha="$head" >/dev/null || { log "update-branch failed"; exit 1; }
  sleep 15; head=$(pr_head)
  is_sha "$head" || { log "no valid PR head after update, stop"; exit 1; }
  retry git fetch -q origin "pull/$pr/head" || { log "cannot fetch updated head, stop"; exit 1; }
  git merge-base --is-ancestor "$main" "$head" || { log "updated head does not contain main ${main:0:8}, stop"; exit 1; }
fi
wait_ci "$head" || exit 1
main=$(gate_ok) || { log "gate closed after CI, stop"; exit 1; }
[ "$(git ls-remote origin refs/heads/main | cut -f1)" = "$main" ] || { log "main moved, stop"; exit 1; }
gh pr merge "$pr" --squash --match-head-commit "$head" >/dev/null || { log "merge failed"; exit 1; }
mc=$(gh pr view "$pr" --json mergeCommit -q .mergeCommit.oid); log "merged ${mc:0:8} (head ${head:0:8})"
for _ in $(seq 1 45); do
  retry git fetch -q origin main; r=$(health)
  if [ -n "$r" ] && git cat-file -e "$r" 2>/dev/null && git merge-base --is-ancestor "$mc" "$r"; then log "LIVE ${r:0:8}"; exit 0; fi
  [ "$(gh run list --workflow=ci.yml --branch main -L 1 --json headSha,conclusion -q '.[0].headSha+" "+.[0].conclusion')" = "$mc failure" ] && { log "MAIN CI FAILED on merge"; exit 2; }
  sleep 60
done
log "not live after 45 min"; exit 3
