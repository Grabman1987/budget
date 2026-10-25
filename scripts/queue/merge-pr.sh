#!/usr/bin/env bash
# merge-pr.sh <pr> - orchestrator helper, the only merge path in use (see docs/queue/README.md).
# Runs locally under the owner's gh login. Steps:
#   1. require checked main and a healthy successfully published ancestor;
#   2. update the PR branch once if it is behind main;
#   3. wait for ci.yml on the exact PR head, re-check the gate and that main did not move;
#   4. squash-merge, verify main, then explicitly release unless --hold-release was requested.
# Exit 0 means verified merge in hold mode, exact live publication otherwise.
# git fetch and gh reads are retried up to 3 times for transient failures.
set -uo pipefail
export PATH="$PATH:/c/Program Files/GitHub CLI" GH_REPO=Grabman1987/budget
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)" || exit 1
pr=$1
mode=${2:-release}
[[ "$mode" = "release" || "$mode" = "--hold-release" ]] || { echo 'usage: merge-pr.sh PR [--hold-release]'; exit 1; }
retry() { # up to 3 tries with a short sleep for transient git/gh errors
  local i; for i in 1 2 3; do "$@" && return 0; [ "$i" -lt 3 ] && sleep 5; done; return 1
}
log() { echo "$(date +%H:%M:%S) #$pr $*"; }
health() { curl -fsS -m 15 https://budget-fg.fly.dev/health | node -e 'const h=JSON.parse(require("fs").readFileSync(0,"utf8"));if(h.status!=="ok"||!/^[a-f0-9]{40}$/.test(h.revision))process.exit(1);console.log(h.revision)'; }
wait_ci() { # $1 sha -> 0 green, 1 red
  local id=""
  for _ in $(seq 1 30); do id=$(gh run list --workflow=ci.yml --commit "$1" -L 1 --json databaseId -q '.[0].databaseId' 2>/dev/null); [ -n "$id" ] && break; sleep 20; done
  [ -z "$id" ] && { log "no CI run for ${1:0:8}"; return 1; }
  gh run watch "$id" --exit-status >/dev/null 2>&1 && return 0
  log "CI red ${1:0:8} run $id: $(gh run view "$id" --log-failed 2>/dev/null | grep -oE '\[[a-z-]+\] › e2e/[^ ]+|FAIL [^ ]+' | sort -u | head -5 | tr '\n' ' ')"
  return 1
}
gate_ok() { # checked main; published revision is a successfully deployed ancestor
  retry git fetch -q origin main || return 1
  local h; h=$(git rev-parse origin/main)
  [ "$(gh run list --workflow=ci.yml --branch main -L 1 --json headSha,conclusion -q '.[0].headSha+" "+.[0].conclusion')" = "$h success" ] || return 1
  # Audits can trigger an entirely skipped Deploy run. It is not a deployment attempt;
  # keep the newest run not explicitly concluded skipped (pending/failure/cancellation block).
  local live; live=$(health)
  [[ "$live" =~ ^[0-9a-f]{40}$ ]] || return 1
  git merge-base --is-ancestor "$live" "$h" || return 1
  [ "$(gh run list --workflow=deploy.yml -L 50 --json headSha,conclusion -q '[.[] | select(.conclusion != "skipped")][0] | .headSha+" "+.conclusion')" = "$live success" ] || return 1
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
fresh_main=$(gate_ok) || { log "gate closed after CI, stop"; exit 1; }
[ "$fresh_main" = "$main" ] || { log "main changed while waiting, restart integration"; exit 1; }
[ "$(git ls-remote origin refs/heads/main | cut -f1)" = "$main" ] || { log "main moved, stop"; exit 1; }
gh pr merge "$pr" --squash --match-head-commit "$head" >/dev/null || { log "merge failed"; exit 1; }
mc=$(gh pr view "$pr" --json mergeCommit -q .mergeCommit.oid); log "merged ${mc:0:8} (head ${head:0:8})"
wait_ci "$mc" || { log 'main verification failed'; exit 2; }
if [ "$mode" = '--hold-release' ]; then
  log "VERIFIED ${mc:0:8}; release pending (not live)"
  exit 0
fi
bash scripts/queue/release.sh "$mc"
