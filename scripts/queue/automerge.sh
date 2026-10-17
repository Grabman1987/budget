#!/usr/bin/env bash
# Local merge policy for risk:low PRs (runs under the owner's gh login so the merge triggers the
# main CI and deploy). Never touches risk:high PRs. Usage: automerge.sh [--dry-run]
set -uo pipefail

DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

REQUIRED="check check-windows docker restore-test"
OPTIONAL="test-integrity coverage" # required only when present

git fetch -q origin 2>/dev/null

prs=$(gh pr list --state open --label risk:low --limit 100 \
  --json number,isDraft,labels,headRefName --jq '.[] | [.number, .isDraft, .headRefName, (.labels | map(.name) | join(","))] | @tsv' | tr -d '\r')

while IFS=$'\t' read -r n draft head labels; do
  [ -z "${n:-}" ] && continue
  [ "$draft" = true ] && { echo "#$n: skip (draft)"; continue; }
  case ",$labels," in *,needs-human,* | *,risk:high,* | *,blocked,*) echo "#$n: skip (blocking label)"; continue ;; esac

  checks=$(gh pr view "$n" --json statusCheckRollup \
    --jq '.statusCheckRollup[] | [(.name // .context), (.conclusion // .state)] | @tsv' | tr -d '\r')
  state() { awk -F'\t' -v c="$1" '$1==c {print $2}' <<<"$checks" | tail -n1; }

  bad=""
  for c in $REQUIRED; do [ "$(state "$c")" = SUCCESS ] || bad="$bad $c"; done
  for c in $OPTIONAL; do s=$(state "$c"); [ -z "$s" ] || [ "$s" = SUCCESS ] || bad="$bad $c"; done
  [ -n "$bad" ] && { echo "#$n: wait (not green:$bad)"; continue; }

  if ! git merge-base --is-ancestor origin/main "origin/$head" 2>/dev/null; then
    if [ "$DRY" = 1 ]; then echo "#$n: would update branch (behind main)"
    else gh pr update-branch "$n" >/dev/null 2>&1 && echo "#$n: branch updated, CI re-runs" || echo "#$n: update-branch failed"; fi
    continue
  fi

  if [ "$DRY" = 1 ]; then echo "#$n: would squash-merge"
  else gh pr merge "$n" --squash --delete-branch >/dev/null 2>&1 && echo "#$n: merged" || echo "#$n: merge failed"; fi
done <<<"$prs"
exit 0
