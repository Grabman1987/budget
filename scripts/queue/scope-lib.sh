# Sourced by run_queue.sh and automerge.sh (no shebang, not executable). Needs: HERE, SCOPES, gh, node.
# The file scope of an issue is the ```queue-scope block of its body, snapshotted once into
# $SCOPES/issue-N.txt (outside the agent's worktree). Delete that file to re-read the issue body.

# Prints the snapshot path of issue $1; creates it from the issue body when absent. No block = no file.
scope_file() {
  local f="$SCOPES/issue-$1.txt"
  if [ ! -s "$f" ]; then
    mkdir -p "$SCOPES"
    if gh issue view "$1" --json body --jq .body 2>/dev/null | node "$HERE/policy.mjs" parse-scope >"$f.tmp"; then
      mv "$f.tmp" "$f"
    else
      rm -f "$f.tmp"
    fi
  fi
  echo "$f"
}

# scope_violation ISSUE PR REPORT: hand the work to the owner; PR may be empty. Never discards anything.
scope_violation() {
  local msg="Queue file-scope check failed: nothing was committed or merged automatically, the work is kept.
Fix the issue's \`queue-scope\` block (then delete logs/queue/scope/issue-$1.txt) or the change, then remove \`needs-human\`.

$3"
  gh issue edit "$1" --add-label needs-human >/dev/null 2>&1 || echo "warn: label needs-human on #$1 failed" >&2
  gh issue comment "$1" --body "$msg" >/dev/null 2>&1 || echo "warn: comment on #$1 failed" >&2
  [ -z "${2:-}" ] && return 0
  gh pr edit "$2" --add-label needs-human >/dev/null 2>&1 || echo "warn: label needs-human on PR #$2 failed" >&2
  gh pr comment "$2" --body "$msg" >/dev/null 2>&1 || echo "warn: comment on PR #$2 failed" >&2
}
