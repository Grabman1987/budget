#!/usr/bin/env bash
# Autonomous queue runner (non-blocking). See docs/queue/README.md.
# Usage: run_queue.sh [--engine claude|codex] [--model M] [--max-parallel N] [--issue N]
#                     [--only-label L] [--dry-run]
# Starts jobs for free slots in the background and returns. Jobs of earlier runs that died are
# reaped first. Internal mode: --run-job N K ENGINE SIZE (the detached job itself).
set -uo pipefail
command -v gh >/dev/null || export PATH="$PATH:/c/Program Files/GitHub CLI"
shopt -u patsub_replacement 2>/dev/null || true # keep '&' in log text literal

ENGINE=claude MODEL=sonnet MAXP=3 ONE="" ONLY="" DRY=0 JOB=""
while [ $# -gt 0 ]; do
  case "$1" in
    --engine) ENGINE=$2; shift 2 ;;
    --model) MODEL=$2; shift 2 ;;
    --max-parallel) MAXP=$2; shift 2 ;;
    --issue) ONE=$2; shift 2 ;;
    --only-label) ONLY=$2; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    --run-job) JOB="$2 $3 $4 $5"; shift 5 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(git -C "$HERE" rev-parse --show-toplevel)
WT_BASE="$(dirname "$ROOT")/wt"
LOGDIR="$ROOT/logs/queue"
JOBS="$LOGDIR/jobs"
TEMPLATE="$HERE/task-prompt.md"
TOOLS="Read,Edit,Write,Glob,Grep,Bash(npm ci),Bash(npm run *),Bash(npx *),Bash(git *),Bash(gh issue *),Bash(gh pr *),Bash(gh label *),Skill"

redact() { sed -E 's/(gh[pousr]_|github_pat_|sk-)[A-Za-z0-9_-]{10,}/[redacted]/g; s/[A-Za-z0-9_-]{32,}/[redacted]/g'; }
export GH_REPO=Grabman1987/budget # gh must not depend on the job's working directory
gl() { gh "$@" >/dev/null 2>>"$LOGDIR/gh-errors.log" || echo "warn: gh $* failed" >&2; }
board() { bash "$HERE/board.sh" "$1" "$2" >/dev/null 2>&1 || echo "warn: board $1 '$2' failed" >&2; }

# sets branch, wt, log for issue $1 and engine $2
paths() {
  branch=agent/issue-$1 log="$LOGDIR/issue-$1.json"
  [ "$2" = codex ] && { branch=codex/issue-$1; log="$LOGDIR/issue-$1.codex.txt"; }
  wt="$WT_BASE/issue-$1"
}

# ---------- finish: after a job ended (normally or not) ----------
finish() {
  local n=$1 k=$2 eng=$3 branch wt log pr labels tail_txt
  paths "$n" "$eng"
  pr=$(gh pr list --state all --head "$branch" --json url --jq '.[0].url // empty' 2>/dev/null)
  labels=$(gh issue view "$n" --json labels --jq '.labels[].name' 2>/dev/null)
  if [ -n "$pr" ]; then
    board "$n" "CI / Review"
    gl issue edit "$n" --remove-label ready # merged-but-not-live issues must not be picked again
    echo "#$n: PR $pr"
  elif grep -qx needs-human <<<"$labels"; then
    board "$n" "Wartet auf Fabian"
    echo "#$n: needs-human"
  else
    tail_txt=$(tail -c 4000 "$log" 2>/dev/null | tail -n 20 | redact)
    if [ "$k" -ge 3 ]; then
      gl issue edit "$n" --add-label needs-human
      board "$n" "Wartet auf Fabian"
      echo "#$n: failed at attempt $k -> needs-human"
    else
      gl issue edit "$n" --add-label agent-failed
      echo "#$n: failed at attempt $k -> agent-failed (retried next run)"
    fi
    gl issue comment "$n" --body "Runner attempt $k ended without a PR. Last log lines:

\`\`\`
$tail_txt
\`\`\`"
  fi
  gl issue edit "$n" --remove-label in-progress
  # keep uncommitted work of a failed attempt for diagnosis before the worktree goes
  [ -z "$pr" ] && git -C "$wt" add -A 2>/dev/null &&
    git -C "$wt" diff --cached -- . ':!node_modules' >"$LOGDIR/issue-$n.attempt-$k.diff" 2>/dev/null
  git -C "$ROOT" worktree remove --force "$wt" 2>/dev/null; rm -rf "$wt"
  [ -z "$pr" ] && git -C "$ROOT" branch -D "$branch" >/dev/null 2>&1
  return 0
}

# ---------- job: one issue, runs detached ----------
run_job() {
  local n=$1 k=$2 eng=$3 size=$4 branch wt log extra="" prompt turns prev
  paths "$n" "$eng"
  mkdir -p "$LOGDIR" "$WT_BASE"
  if [ "$k" -gt 1 ]; then # previous attempt's log tail becomes {{EXTRA}}
    prev=$(ls -t "$LOGDIR/issue-$n.json" "$LOGDIR/issue-$n.codex.txt" 2>/dev/null | head -n1)
    [ -n "$prev" ] && extra="Previous attempt failed. Tail of its log (fix the cause, do not repeat it):
$(tail -c 3000 "$prev" | redact)"
  fi
  git -C "$ROOT" worktree remove --force "$wt" 2>/dev/null; rm -rf "$wt"
  git -C "$ROOT" fetch -q origin main
  if git -C "$ROOT" worktree add -q -B "$branch" "$wt" origin/main; then
    prompt=$(cat "$TEMPLATE")
    prompt=${prompt//\{\{N\}\}/$n}
    prompt=${prompt//\{\{EXTRA\}\}/$extra}
    turns=40; [ "$size" = S ] && turns=25
    if [ "$eng" = codex ]; then
      # Sandboxed: writes only in the worktree and the shared .git dir, network for npm. The sandbox
      # cannot read the gh/git credentials, so the runner supplies the issue and pushes/opens the PR.
      prompt="$prompt

CODEX SANDBOX RULES (override steps 1, 6 and 7 above): you have no GitHub access – never run gh,
git push or git fetch, git add or git commit (the sandbox cannot write git metadata). The issue with its comments
is below. Leave your changes uncommitted; the runner commits them with your title line. Your final message: line 1 = the PR title (Conventional Commits), then the PR
body from .github/pull_request_template.md with \"Refs #$n\". If a human decision is needed, commit
nothing and start the final message with \"NEEDS-HUMAN:\" and the concrete question – only for a
product or scope decision, never for an environment problem. Playwright browsers cannot start in this
sandbox (os.userInfo fails): that is expected. Run what works (typecheck, lint, unit tests, build),
write the new e2e spec anyway, leave it uncommitted, and say in the PR body which local checks could not run; the
PR's CI runs the e2e suite and gates the merge.

$(gh issue view "$n" --comments 2>&1)"
      codex exec -s workspace-write -c sandbox_workspace_write.network_access=true \
        --add-dir "$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir)" -C "$wt" --json -o "$log" "$prompt" >"$LOGDIR/issue-$n.codex.jsonl" 2>&1 </dev/null
      if grep -q '^NEEDS-HUMAN:' "$log" 2>/dev/null; then
        gl issue comment "$n" --body-file "$log"
        gl issue edit "$n" --add-label needs-human
      else
        [ -n "$(git -C "$wt" status --porcelain)" ] && git -C "$wt" add -A &&
          git -C "$wt" commit -q -m "$(head -n1 "$log")" -m "Refs #$n"
      fi
      if ! grep -q '^NEEDS-HUMAN:' "$log" 2>/dev/null && [ -n "$(git -C "$wt" log --oneline origin/main..HEAD)" ]; then
        labels=$(gh issue view "$n" --json labels --jq '[.labels[].name | select(test("^(risk|area):"))] | join(",")')
        git -C "$wt" push -q -u origin "$branch" &&
          tail -n +2 "$log" | gh pr create --head "$branch" --title "$(head -n1 "$log")" --body-file - \
            --label "$labels" >>"$LOGDIR/runner-$n.out" 2>&1
      fi
    else
      (cd "$wt" && claude -p "$prompt" --model "$MODEL" --permission-mode acceptEdits --max-turns "$turns" \
        --output-format json --allowedTools "$TOOLS") >"$log" 2>&1 </dev/null
    fi
  else
    echo "worktree creation failed" >"$log"
  fi
  finish "$n" "$k" "$eng"
  rm -f "$JOBS/issue-$n.pid"
}

if [ -n "$JOB" ]; then
  # shellcheck disable=SC2086
  set -- $JOB
  run_job "$1" "$2" "$3" "$4"
  exit 0
fi

# ---------- reap: jobs whose process is gone (crash, reboot) ----------
reap() {
  local f n pid k eng
  for f in "$JOBS"/issue-*.pid; do
    [ -e "$f" ] || continue
    n=${f##*/issue-}; n=${n%.pid}
    read -r pid k eng <"$f"
    kill -0 "$pid" 2>/dev/null && continue
    if [ "$DRY" = 1 ]; then echo "would reap #$n"; continue; fi
    echo "reap #$n (job process gone)"
    finish "$n" "$k" "$eng"
    rm -f "$f"
  done
}
[ "$DRY" = 1 ] || mkdir -p "$JOBS"
reap

# ---------- select candidates ----------
heads=$(gh pr list --state open --limit 200 --json headRefName --jq '.[].headRefName')
running=$(gh issue list --state open --label in-progress --limit 100 --json labels --jq '.[].labels[].name')
nrunning=$(gh issue list --state open --label in-progress --limit 100 --json number --jq 'length')
busy=" $(grep '^area:' <<<"$running" | tr '\n' ' ')"
slots=$((MAXP - nrunning))

cands=$(gh issue list --state open --label ready --limit 100 --json number,labels \
  --jq '.[] | [.number, (.labels | map(.name) | join(","))] | @tsv' | tr -d '\r')

# rank: S=1, M/none=2; L skipped; sort by rank then number
sorted=$(while IFS=$'\t' read -r n labels; do
  [ -z "$n" ] && continue
  [ -n "$ONE" ] && [ "$n" != "$ONE" ] && continue
  if [ -n "$ONLY" ]; then case ",$labels," in *,"$ONLY",*) ;; *) continue ;; esac; fi
  case ",$labels," in *,size:L,*) echo "#$n: size:L, split it" >&2; continue ;; esac
  r=2; case ",$labels," in *,size:S,*) r=1 ;; esac
  echo "$r $n $labels"
done <<<"$cands" | sort -k1,1n -k2,2n)

started=0
while read -r rank n labels; do
  [ -z "${n:-}" ] && continue
  [ "$started" -ge "$slots" ] && break
  has() { case ",$labels," in *,"$1",*) return 0 ;; esac; return 1; }
  skip=""
  for l in blocked needs-human epic in-progress; do has "$l" && skip=$l; done
  has agent-failed && ! has attempt:1 && ! has attempt:2 && skip=agent-failed # retryable only on attempts 1-2
  grep -qxE "(agent|codex)/issue-$n" <<<"$heads" && skip="open PR"
  [ -n "$skip" ] && { echo "#$n: skip ($skip)"; continue; }
  area=$(tr ',' '\n' <<<"$labels" | grep '^area:' | head -n1)
  if [ -n "$area" ] && [[ "$busy" == *" $area "* ]]; then echo "#$n: skip (area lock $area)"; continue; fi

  k=1; has attempt:1 && k=2; has attempt:2 && k=3; has attempt:3 && k=4
  size=M; [ "$rank" = 1 ] && size=S
  eng=$ENGINE; [ "$k" -eq 3 ] && eng=codex
  if [ "$k" -gt 3 ]; then
    [ "$DRY" = 1 ] && { echo "would escalate #$n to needs-human (attempts exhausted)"; continue; }
    gl issue edit "$n" --add-label needs-human --remove-label agent-failed
    gl issue comment "$n" --body "Runner: all 3 attempts used. Needs a human (or an orchestrator-chosen Opus attempt for risk:high)."
    board "$n" "Wartet auf Fabian"; continue
  fi
  if [ "$DRY" = 1 ]; then
    echo "would start #$n size:$size ${area:-no-area} engine=$eng attempt=$k"
  else
    echo "start #$n size:$size ${area:-no-area} engine=$eng attempt=$k"
    gl issue edit "$n" --add-label "in-progress,attempt:$k" --remove-label agent-failed
    board "$n" "In Arbeit"
    nohup bash "$HERE/run_queue.sh" --run-job "$n" "$k" "$eng" "$size" --model "$MODEL" \
      >>"$LOGDIR/runner-$n.out" 2>&1 </dev/null &
    echo "$! $k $eng" >"$JOBS/issue-$n.pid"
  fi
  [ -n "$area" ] && busy="$busy$area "
  started=$((started + 1))
done <<<"$sorted"

[ "$started" -eq 0 ] && echo "nothing to start (slots=$slots)"
exit 0
