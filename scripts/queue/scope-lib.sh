# Sourced by run_queue.sh and automerge.sh (no shebang, not executable).
# Needs: HERE, ROOT, LOGDIR, SCOPES (= $LOGDIR/scope), gh, node, git.
#
# File scope: the ```queue-scope block of an issue body is snapshotted ONCE by the runner (before a job
# starts) into $SCOPES/issue-N.txt, outside the agent's worktree. Everything later (commit, push,
# automerge) reads only that file; a missing file means "no scope" = nothing is committed or merged.
# Delete the file to let the runner re-read an edited issue.

scope_path() { echo "$SCOPES/issue-$1.txt"; }

# scope_snapshot ISSUE [--dry-run]: 0 = snapshot exists (or would be created), 1 = issue has no queue-scope
# block, 2 = issue body unreadable. Never overwrites an existing snapshot.
scope_snapshot() {
  local f globs body
  f=$(scope_path "$1")
  [ -s "$f" ] && return 0
  body=$(gh issue view "$1" --json body --jq .body 2>/dev/null) || return 2
  globs=$(node "$HERE/policy.mjs" parse-scope <<<"$body") || return 1
  [ "${2:-}" = --dry-run ] && return 0
  mkdir -p "$SCOPES" && printf '%s\n' "$globs" >"$f"
}

# Tells the issue (once) why the runner did not start it.
no_scope_comment() {
  local c
  c=$(gh issue view "$1" --json comments --jq '.comments[].body' 2>/dev/null)
  grep -q 'queue-no-scope' <<<"$c" && return 0
  gh issue comment "$1" --body "<!-- queue-no-scope -->
The runner did not start this issue: its body has no fenced \`queue-scope\` block (one allowed file glob per line, e.g. \`apps/web/src/plan/**\`). Add it, then the next run picks the issue up." >/dev/null 2>&1
}

# scope_violation ISSUE PR REPORT: hand the work to the owner; PR may be empty. Never discards anything.
scope_violation() {
  local msg="Queue file-scope check failed: nothing was committed, pushed or merged automatically, the work is kept.
Fix the issue's \`queue-scope\` block (then delete logs/queue/scope/issue-$1.txt) or the change, then remove \`needs-human\`.

$3"
  gh issue edit "$1" --add-label needs-human >/dev/null 2>&1 || echo "warn: label needs-human on #$1 failed" >&2
  gh issue comment "$1" --body "$msg" >/dev/null 2>&1 || echo "warn: comment on #$1 failed" >&2
  [ -z "${2:-}" ] && return 0
  gh pr edit "$2" --add-label needs-human >/dev/null 2>&1 || echo "warn: label needs-human on PR #$2 failed" >&2
  gh pr comment "$2" --body "$msg" >/dev/null 2>&1 || echo "warn: comment on PR #$2 failed" >&2
}

# ---------- git in agent worktrees (the agent may have tampered with them) ----------

# The git dir git wrote for worktree $1 when the runner created it.
wt_gitdir() { echo "$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir)/worktrees/$(basename "$1")"; }

# True iff the worktree's .git file is exactly the one git wrote when the runner created it. An agent can
# rewrite that file to point at a repository whose config or hooks would then run with our credentials.
wt_ok() {
  [ "$(cat "$1/.git" 2>/dev/null)" = "gitdir: $(wt_gitdir "$1")" ]
}

# git in the worktree $1 without hooks and without fsmonitor. Call only after wt_ok. --git-dir/--work-tree
# are explicit, so a .git file swapped after the check cannot redirect the command.
wgit() {
  local wt=$1
  shift
  mkdir -p "$LOGDIR/nohooks"
  git -C "$wt" --git-dir="$(wt_gitdir "$wt")" --work-tree="$wt" -c core.hooksPath="$LOGDIR/nohooks" -c core.fsmonitor=false "$@"
}

# True if the worktree has uncommitted work or cannot be inspected safely (then it must be kept).
dirty() {
  [ -e "$1/.git" ] || return 1
  wt_ok "$1" || return 0
  [ -n "$(wgit "$1" status --porcelain=v1 --untracked-files=all 2>/dev/null)" ]
}

# scope_gate ISSUE KIND < changes: 0 = every path is inside the scope; otherwise reports to the issue
# (needs-human) and returns 1. KIND = porcelain | name-status.
scope_gate() {
  local rep
  rep=$(node "$HERE/policy.mjs" check-scope "$2" "$(scope_path "$1")") && return 0
  echo "#$1: scope violation, nothing committed or pushed, work kept: $(tr '\n' ';' <<<"$rep")"
  scope_violation "$1" "" "$rep"
  return 1
}

# publish_in_scope ISSUE WORKTREE BRANCH TITLE (Codex path): commits exactly the changed paths and pushes,
# but only if the FULL change set (commits ahead of origin/main, then uncommitted/untracked/deleted/renamed
# files, then the final range again before the push) is inside the scope. 0 = pushed, otherwise nothing was.
publish_in_scope() {
  local n=$1 wt=$2 branch=$3 title=$4 tmp
  if ! wt_ok "$wt"; then
    echo "#$n: $wt/.git was changed, no git command run there, work kept"
    scope_violation "$n" "" "The worktree's \`.git\` file no longer points at the repository the runner created. Nothing was run, committed or pushed in it; inspect it by hand."
    return 1
  fi
  tmp=$(mktemp)
  wgit "$wt" diff --name-status -M -z origin/main...HEAD >"$tmp" && scope_gate "$n" name-status <"$tmp" || { rm -f "$tmp"; return 1; }
  wgit "$wt" status --porcelain=v1 -z --untracked-files=all >"$tmp" || { rm -f "$tmp"; return 1; }
  if [ -s "$tmp" ]; then
    scope_gate "$n" porcelain <"$tmp" || { rm -f "$tmp"; return 1; }
    node "$HERE/policy.mjs" paths0 porcelain <"$tmp" |
      GIT_LITERAL_PATHSPECS=1 wgit "$wt" add --pathspec-from-file=- --pathspec-file-nul &&
      wgit "$wt" commit -q -m "$title" -m "Refs #$n" || { rm -f "$tmp"; return 1; }
  fi
  wgit "$wt" diff --name-status -M -z origin/main...HEAD >"$tmp" && scope_gate "$n" name-status <"$tmp" || { rm -f "$tmp"; return 1; }
  rm -f "$tmp"
  [ -n "$(wgit "$wt" log --oneline origin/main..HEAD)" ] || return 1 # nothing to publish
  wgit "$wt" push -q -u origin "$branch"
}
