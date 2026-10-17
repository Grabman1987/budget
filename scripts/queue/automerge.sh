#!/usr/bin/env bash
# Local merge policy for risk:low PRs (runs under the owner's gh login so the merge triggers the
# main CI and deploy). Never touches risk:high PRs. At most ONE merge per run, and only if the merge
# gate (gate.sh) passes. The gate names the main head H it validated; the whole run is bound to H and to
# each PR's head SHA (read once): required checks must be green for that exact SHA, the diff must stay
# inside the issue's queue-scope SNAPSHOT (never the live issue body), and the merge is pinned to the
# SHA (--match-head-commit). Right before merging, origin/main is re-read and must still be H.
# Usage: automerge.sh [--dry-run]
set -uo pipefail
command -v gh >/dev/null || export PATH="$PATH:/c/Program Files/GitHub CLI"
export GH_REPO=${GH_REPO:-Grabman1987/budget}

DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(git -C "$HERE" rev-parse --show-toplevel)
LOGDIR="$ROOT/logs/queue"
SCOPES="$LOGDIR/scope"
POLICY="$HERE/policy.mjs"
# shellcheck source=scope-lib.sh
. "$HERE/scope-lib.sh"
g() { git -C "$ROOT" "$@"; }

REQUIRED="check check-windows docker restore-test"
OPTIONAL="test-integrity coverage" # required only when present

gate=$(bash "$HERE/gate.sh" 2>&1) || { echo "no merge: $gate"; exit 0; }
H=${gate#ok }
[[ "$H" =~ ^[0-9a-f]{40}$ ]] || { echo "no merge: gate did not name a main head ($gate)"; exit 0; }

g fetch -q origin 2>/dev/null
[ "$(g rev-parse --verify -q origin/main)" = "$H" ] || { echo "no merge: main moved since the gate (gated ${H:0:7})"; exit 0; }

prs=$(gh pr list --state open --label risk:low --limit 100 \
  --json number,isDraft,labels,headRefName --jq '.[] | [.number, .isDraft, .headRefName, (.labels | map(.name) | join(","))] | @tsv' | tr -d '\r')

while IFS=$'\t' read -r n draft head labels; do
  [ -z "${n:-}" ] && continue
  [ "$draft" = true ] && { echo "#$n: skip (draft)"; continue; }
  case ",$labels," in *,needs-human,* | *,risk:high,* | *,blocked,*) echo "#$n: skip (blocking label)"; continue ;; esac

  # the head SHA is read once; checks, scope, branch state and the merge itself are all bound to it
  sha=$(gh pr view "$n" --json headRefOid --jq .headRefOid 2>/dev/null | tr -d '\r')
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "#$n: wait (head sha unreadable)"; continue; }
  s7=${sha:0:7}

  [[ "$head" =~ ^(agent|codex)/issue-([0-9]+)$ ]] || { echo "#$n: skip (not a queue PR, no queue-scope)"; continue; }
  issue=${BASH_REMATCH[2]}
  scope=$(scope_path "$issue")
  [ -s "$scope" ] || { echo "#$n: skip (no scope snapshot $scope)"; continue; } # never fetched from the live issue
  if ! g cat-file -e "$sha^{commit}" 2>/dev/null; then
    g fetch -q origin "refs/pull/$n/head" 2>/dev/null
    g cat-file -e "$sha^{commit}" 2>/dev/null || { echo "#$n: wait (head $s7 not fetchable)"; continue; }
  fi

  # file scope: the real diff of exactly this head against H (adds, deletes, both paths of renames)
  diff=$(mktemp)
  if ! g diff --name-status -M -z "$H...$sha" >"$diff" 2>/dev/null; then
    rm -f "$diff"; echo "#$n: wait (diff of $s7 unreadable)"; continue
  fi
  report=$(node "$POLICY" check-scope name-status "$scope" <"$diff"); rc=$?
  rm -f "$diff"
  if [ "$rc" -eq 1 ]; then
    echo "#$n: scope violation ($s7): $(tr '\n' ';' <<<"$report")"
    if [ "$DRY" = 1 ]; then echo "#$n: would label needs-human and comment"
    else scope_violation "$issue" "$n" "$report"; fi
    continue
  elif [ "$rc" -ne 0 ]; then echo "#$n: wait (scope check failed to run)"; continue; fi

  runs=$(gh api --paginate "repos/$GH_REPO/commits/$sha/check-runs?per_page=100" \
    --jq '.check_runs[] | {id, name, status, conclusion, head_sha}' 2>/dev/null) || { echo "#$n: wait (check runs unreadable)"; continue; }
  if ! bad=$(node "$POLICY" checks "$sha" "$REQUIRED" "$OPTIONAL" <<<"$runs"); then
    echo "#$n: wait (not green for $s7: $bad)"; continue
  fi

  if ! g merge-base --is-ancestor "$H" "$sha" 2>/dev/null; then
    if [ "$DRY" = 1 ]; then echo "#$n: would update branch (behind main)"
    elif gh api -X PUT "repos/$GH_REPO/pulls/$n/update-branch" -f expected_head_sha="$sha" >/dev/null 2>&1; then
      echo "#$n: branch updated, CI re-runs (skipped this round)"
    else echo "#$n: update-branch failed"; fi
    continue
  fi

  # main must still be the gated H right before the merge (a small window remains, see docs/queue/README.md)
  now=$(g ls-remote origin refs/heads/main 2>/dev/null | cut -f1)
  [ "$now" = "$H" ] || { echo "#$n: skip (main moved before the merge: ${now:0:7} is not the gated ${H:0:7})"; break; }

  if [ "$DRY" = 1 ]; then echo "#$n: would squash-merge $s7 (one merge per run)"; break; fi
  if gh pr merge "$n" --squash --delete-branch --match-head-commit "$sha" >/dev/null 2>&1; then
    echo "#$n: merged $s7 (one merge per run, the next one waits until main is live)"; break
  else echo "#$n: merge failed"; fi
done <<<"$prs"
exit 0
