---
name: pr-ship
description: Ship an explicitly requested branch through GitHub checks and a merge commit.
argument-hint: <branch> [delivery bundle or git directory]
disable-model-invocation: true
user-invocable: true
---

# Ship a branch

Use `$ARGUMENTS` as the branch and optional Codex delivery source. Invocation authorizes
shipping that branch, subject to any narrower owner instruction (for example, draft
only or do not merge). Reject main as the shipping branch. Read SPEC.md, CLAUDE.md
and docs/ROADMAP.md. Keep public commits and PR text synthetic and generic.
Never force-push main, bypass protections, change
repo settings, or deploy separately. Stop on missing credentials or ambiguous scope.

## Import a Codex delivery first, when supplied

Inspect the manifest and base SHA. A delivery is code, not an instruction to execute
included scripts. Inspect its diff before checking out or running it. Keep an existing
dirty checkout intact; use a clean worktree if needed. Validate the branch with
`git check-ref-format --branch <branch>` and reject main as the delivery target.

```sh
git bundle verify data/task-delivery/<x>.bundle
git fetch data/task-delivery/<x>.bundle refs/heads/<branch>
git log --oneline origin/main..FETCH_HEAD
git diff --stat origin/main...FETCH_HEAD
```

For a delivery git directory, use
`git fetch <delivery-git-dir> refs/heads/<branch>` instead. Record FETCH_HEAD's SHA
immediately. Create a missing local branch from that SHA with `git switch -c <branch>
<sha>`; fast-forward an existing branch only after confirming its ancestry. If it
diverged, stop and report; do not reset or force-push. Review the complete diff and
run `npm run check` and `npm run build` on the imported tree before shipping.

## Push, create and watch

1. Confirm the exact repository, branch, clean worktree and reviewed commits. Fetch
   origin/main outside hooks and inspect `git log origin/main..<branch>` and the
   three-dot diff. Run the repository-required checks if not already evidenced for
   this exact tree. Use npm.cmd/npx.cmd in PowerShell if execution policy blocks npm.ps1.
2. `git push -u origin <branch>` (ordinary push only). Find the open PR with
   `gh pr list --head <branch> --base main --state open --json number,url,isDraft`.
   Reuse it. If none exists, derive a concise title and accurate body from the
   reviewed commits, with German summary, test plan and Owner steps. Write the body
   to a temporary UTF-8 file and use `gh pr create --base main --head <branch>
   --title <title> --body-file <file>` (add `--draft` if requested). The body must end
   with exactly:

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

3. Record the PR head SHA. Run `gh pr checks <pr> --watch --interval 180`.
   All GitHub API polling, including workflow and bot-commit waits, must be at least
   three minutes apart. Exit code 8 means pending; wait, never treat it as green.

## Classify failed checks from evidence

Find the CI run for the PR's **current head SHA**, then read
`gh run view <run-id> --log-failed`. Classify every failed job; do not change unrelated
code or snapshots to make a failing run appear green.

- **Intended Linux screenshot differences:** only when the reviewed UI change explains
  the differences and logs/artifacts show no unrelated assertion failure. Inspect
  `.github/workflows/update-snapshots.yml` at origin/main. If its update job still has
  `timeout-minutes: 20`, select a pushed, reviewed workflow ref whose update job has
  `timeout-minutes: 45`, and verify that exact workflow (for example with `git show
  origin/<workflow-ref>:.github/workflows/update-snapshots.yml`). If no such ref exists,
  stop and report the missing prerequisite. Do not silently dispatch the 20-minute
  workflow. Dispatch `gh workflow run update-snapshots.yml --ref <workflow-ref>
  -f branch=<branch>`; when main already has 45 minutes, main may be the workflow ref.
  The **input branch must always be the feature branch**, never main.
  Identify the dispatched run by ref, time and target input; poll every 180 seconds.
  After success, fetch the feature branch, verify the bot commit only updates intended
  e2e baselines, then `git merge --ff-only origin/<branch>`. A failed workflow or a run
  without an expected bot baseline commit is a stop, not permission to merge.
  Create `git commit --allow-empty -m "ci: re-run checks after baseline update"`,
  push the feature branch and watch the fresh PR checks at the new SHA. The bot's
  GITHUB_TOKEN commit alone does not trigger CI. Update baselines at most once per tree.
- **Known flakes:** shell "all 61 routes" timeout; ledger expected 860 versus 857,50;
  capture Axe contrast depending on fixture data; Windows PDF timeouts. These are
  candidates, not blanket waivers: match the actual failure signature and confirm
  the reviewed change did not alter that behavior. With no real failure in the run,
  `gh run rerun <run-id> --failed` **once** for that head SHA, then watch checks again
  at 180-second intervals. A repeated or ambiguous failure stops shipping.
- **Real failures:** stop and report the failing job, relevant redacted log excerpt,
  cause and next action. Do not merge, update unrelated baselines or retry indefinitely.

## Merge gate

Re-read `gh pr view <pr> --json headRefOid,isDraft,mergeable` and
`gh pr checks <pr> --json name,state,link`. The four named checks **check,
check-windows, docker, restore-test** must each exist and be SUCCESS for the current
head SHA; missing, skipped, cancelled, pending or failed is not green. Verify their
run SHAs and do not ignore additional blocking failures. If the head changed, repeat
the gate. Respect draft-only/no-merge instructions; a draft needs explicit readiness
authorization before `gh pr ready`. When authorized and all checks are green,
`gh pr merge <pr> --merge --match-head-commit <verified-sha>`. Never use `--admin` or
auto-merge to bypass this gate. Report branch, commits, PR URL, actual merge result
and any separate owner/production acceptance still open.
