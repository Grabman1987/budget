#!/usr/bin/env bash
# Unattended queue loop: live.sh, gate.sh then automerge.sh (only if the merge gate passes), run_queue.sh, sleep. Stop with: touch logs/queue/STOP
# Usage: loop.sh [--interval S] [--once] [--max-rounds N] [--dry-run]
#                [--only-label L] [--engine E] [--model M] [--max-parallel N]
set -uo pipefail
command -v gh >/dev/null || export PATH="$PATH:/c/Program Files/GitHub CLI"

INTERVAL=300 ONCE=0 MAXR=0 DRY=0 RQ=()
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

round=0
while :; do
  if [ -f "$STOPFILE" ]; then log "STOP file found, exiting"; rm -f "$STOPFILE"; break; fi
  round=$((round + 1))
  out=$(bash "$HERE/live.sh" "${DRYARG[@]}" 2>&1); rc=$?
  log "live: $(oneline <<<"${out:-nothing}")"
  if gout=$(bash "$HERE/gate.sh" 2>&1); then
    log "gate: $(oneline <<<"${gout:-ok}")"
    out=$(bash "$HERE/automerge.sh" "${DRYARG[@]}" 2>&1)
    log "automerge: $(oneline <<<"${out:-nothing}")"
  else
    log "gate: $(oneline <<<"${gout:-BLOCK: gate.sh failed without output}")"
    log "automerge: skipped (merge gate blocked, no merge this round)"
  fi
  if [ "$rc" -eq 2 ]; then
    log "run_queue: not starting new work (main CI/deploy failed)"
  else
    out=$(bash "$HERE/run_queue.sh" "${RQ[@]}" 2>&1)
    log "run_queue: $(oneline <<<"${out:-nothing}")"
  fi
  [ "$ONCE" = 1 ] && break
  [ "$MAXR" -gt 0 ] && [ "$round" -ge "$MAXR" ] && break
  for ((i = 0; i < INTERVAL; i += 5)); do [ -f "$STOPFILE" ] && break; sleep 5; done
done
