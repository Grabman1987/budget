#!/usr/bin/env bash
# Unattended queue loop: live.sh, gate.sh then automerge.sh (only if the merge gate passes), run_queue.sh, sleep. Stop with: touch logs/queue/STOP
# Pacing: a round every --interval s (default 60); 5 idle rounds in a row back off to 5 min, error rounds double
# the delay up to 10 min, any activity resets it (policy.mjs delay). STOP is checked every 5 s and always wins.
# Usage: loop.sh [--interval S] [--once] [--max-rounds N] [--dry-run]
#                [--only-label L] [--engine E] [--model M] [--max-parallel N]
set -uo pipefail
command -v gh >/dev/null || export PATH="$PATH:/c/Program Files/GitHub CLI"

INTERVAL=60 ONCE=0 MAXR=0 DRY=0 RQ=()
while [ $# -gt 0 ]; do
  case "$1" in
    --interval) INTERVAL=$2; shift 2 ;;
    --once) ONCE=1; shift ;;
    --max-rounds) MAXR=$2; shift 2 ;;
    --dry-run) DRY=1; RQ+=("$1"); shift ;;
    --only-label | --engine | --model | --max-parallel) RQ+=("$1" "$2"); shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

HERE=$(cd "$(dirname "$0")" && pwd)
LOGDIR=$(git -C "$HERE" rev-parse --show-toplevel)/logs/queue
mkdir -p "$LOGDIR"
PIDFILE="$LOGDIR/loop.pid" STOPFILE="$LOGDIR/STOP"
DRYARG=(); [ "$DRY" = 1 ] && DRYARG=(--dry-run)

log() { echo "$(date '+%F %T') $*" >>"$LOGDIR/loop.log"; echo "$*"; }
oneline() { tr '\n' ';' | sed 's/;$//; s/;/; /g'; }

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "loop already running (pid $(cat "$PIDFILE"))" >&2
  exit 1
fi
echo $$ >"$PIDFILE"
trap 'rm -f "$PIDFILE"' EXIT

# Round classification for the pacing (policy.mjs delay): error = gh/network trouble, activity = something merged,
# closed, commented, updated, started or reaped.
has() { grep -qE "$1" <<<"$2"; }

round=0 idle=0 errs=0
while :; do
  if [ -f "$STOPFILE" ]; then
    reason=$(head -n1 "$STOPFILE" | tr -c '[:print:]' ' ' | sed 's/^ *//; s/ *$//' | cut -c1-200)
    log "STOP file found (mtime $(date -r "$STOPFILE" '+%F %T'), $(wc -c <"$STOPFILE" | tr -d ' ') bytes, reason: ${reason:-none})"
    rm -f "$STOPFILE"; break
  fi
  round=$((round + 1)) act=0 err=0
  lout=$(bash "$HERE/live.sh" "${DRYARG[@]}" 2>&1); rc=$?
  log "live: $(oneline <<<"${lout:-nothing}")"
  has 'live in |closed' "$lout" && act=1
  has 'failed|cannot read|no healthy|unreadable' "$lout" && err=1
  if gout=$(bash "$HERE/gate.sh" 2>&1); then
    log "gate: $(oneline <<<"${gout:-ok}")"
    out=$(bash "$HERE/automerge.sh" "${DRYARG[@]}" 2>&1)
    log "automerge: $(oneline <<<"${out:-nothing}")"
    has ': merged |branch updated' "$out" && act=1
  else
    log "gate: $(oneline <<<"${gout:-BLOCK: gate.sh failed without output}")"
    log "automerge: skipped (merge gate blocked, no merge this round)"
    has 'failed|unreachable' "$gout" && err=1
  fi
  if [ "$rc" -eq 2 ]; then
    log "run_queue: not starting new work (main CI/deploy failed)"
  else
    out=$(bash "$HERE/run_queue.sh" "${RQ[@]}" 2>&1)
    log "run_queue: $(oneline <<<"${out:-nothing}")"
    has '^start |^reap |: PR ' "$out" && act=1
  fi
  if [ "$err" = 1 ]; then errs=$((errs + 1)) idle=$((idle + 1))
  elif [ "$act" = 1 ]; then errs=0 idle=0
  else errs=0 idle=$((idle + 1)); fi
  delay=$(node "$HERE/policy.mjs" delay "$INTERVAL" "$idle" "$errs" 2>/dev/null)
  { [[ "$delay" =~ ^[0-9]+$ ]] && [ "$delay" -ge 5 ]; } || delay=600 # node failed or bad --interval: slow, never a busy loop
  log "pace: idle=$idle errors=$errs next=${delay}s"
  [ "$ONCE" = 1 ] && break
  [ "$MAXR" -gt 0 ] && [ "$round" -ge "$MAXR" ] && break
  for ((i = 0; i < delay; i += 5)); do [ -f "$STOPFILE" ] && break; sleep 5; done
done
