# Autonomous queue

Small GitHub issues are implemented by agents (Claude Code or Codex) in isolated worktrees: one
issue = one fresh session = one PR. State lives in labels and PRs, so any run can be restarted.
Tooling: `scripts/queue/` (`labels.sh`, `run_queue.sh`, `automerge.sh`, `live.sh`, `loop.sh`,
`board.sh`, `task-prompt.md`). Issue form: `.github/ISSUE_TEMPLATE/agent-task.yml`.

## Labels

| Label                                                                                       | Meaning                                                |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `ready`                                                                                     | Specified; the runner may pick it up                   |
| `needs-human`                                                                               | Agent stopped; owner decision or action required       |
| `blocked`                                                                                   | Waiting on another issue or external input             |
| `epic`                                                                                      | Too big for one PR; split into child issues            |
| `in-progress`                                                                               | A job is running (set by the runner)                   |
| `agent-failed`                                                                              | Last job ended without a PR; retried while attempt < 3 |
| `attempt:1` `attempt:2` `attempt:3`                                                         | Escalation ladder position                             |
| `tests-change-approved`                                                                     | Owner allows changing existing tests or tolerances     |
| `ui-change`                                                                                 | Visible UI change; visual baselines may update         |
| `flaky-test`                                                                                | Test failed, then passed on re-run                     |
| `incident`                                                                                  | Suspected data loss or security problem                |
| `visual-baselines`                                                                          | Snapshot baselines updated                             |
| `risk:low` / `risk:high`                                                                    | Merge policy (below)                                   |
| `area:ledger` `area:ui` `area:nav` `area:portfolio` `area:plan` `area:reports` `area:accounts` `area:settings` `area:infra` `area:docs` | Area lock: one running issue per area |
| `size:S` / `size:M` / `size:L`                                                              | Max turns 25 / 40 / must be split                      |

Create them once with `bash scripts/queue/labels.sh` (idempotent).

## Flow

1. Issue created from the agent-task form, triaged by the orchestrator (area, risk, size), labelled `ready`.
2. `bash scripts/queue/run_queue.sh` picks ready issues (S before M, then by number), at most one
   per area and `--max-parallel` at once; it skips issues with an open `agent/issue-N` or `codex/issue-N` PR.
3. Job: worktree `<repo-parent>/wt/issue-N` from fresh `origin/main`; the agent implements, runs
   `npm run check` and `npm run build`, opens the PR. Board status: In Arbeit, then CI / Review
   (PR) or Wartet auf Fabian (`needs-human`).
4. Merge: `risk:low` via `automerge.sh`, `risk:high` via review and manual merge.
5. The merge to `main` triggers CI and deploy. `live.sh` closes the issue (comment "Live in <rev>") and sets
   the board to Live only once the merge commit is contained in the deployed `/health` revision.
   PRs say `Refs #N`, never `Closes`: closing means live, not merged.

Options: `run_queue.sh [--engine claude|codex] [--model sonnet] [--max-parallel 3] [--issue N] [--only-label L] [--dry-run]`.
`--issue N` still requires the `ready` label. `--only-label L` considers only issues that also carry `L` (pilot: `queue:pilot`).
The runner is non-blocking: it starts detached jobs (`nohup`), records `logs/queue/jobs/issue-N.pid` and returns.

## Unattended loop

`loop.sh` repeats `live.sh`, `automerge.sh`, `run_queue.sh`, then sleeps (`--interval`, default 300 s;
`--once`, `--max-rounds N`, `--dry-run`, `--only-label`, `--engine`, `--model`, `--max-parallel` are passed through).

- Start: `nohup bash scripts/queue/loop.sh > /dev/null 2>&1 &` (refuses to start if `logs/queue/loop.pid` holds a live pid).
- Stop: `touch logs/queue/STOP` (checked every round and while sleeping; removed when honoured).
- Logs: `logs/queue/loop.log` (timestamped one-liners), `issue-N.json`/`.codex.txt`, `runner-N.out`.
- `live.sh` exit 2 (latest main CI or deploy failed) prints a STOP line: the loop keeps live/automerge going but starts no new work.
- Reap: at the start of every `run_queue.sh`, a job whose pid in `jobs/issue-N.pid` is gone (crash, reboot) is finished
  as if it had ended: PR found -> CI / Review; `needs-human` -> Wartet auf Fabian; otherwise `agent-failed` (attempt < 3,
  retried) or `needs-human` (attempt 3), with a comment. `in-progress` and the worktree are cleaned up.
- Stale `in-progress` label without a pid file (set by hand or lost files) is never touched automatically; remove it manually.
- Limitation: it runs only while this Windows PC is awake and logged in; nothing runs in the cloud.

## Merge policy

| Case           | Rule                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `risk:low`     | `automerge.sh`: `check` (aggregates unit, e2e, visual), `check-windows`, `docker`, `restore-test` green (+ `test-integrity`, `coverage` if present), branch current, squash merge |
| `risk:high`    | Independent review agent (Opus subagent or Codex), then the orchestrator merges manually                                  |
| Test gate red  | Only with `tests-change-approved`, set by the owner                                                                       |
| Merge conflict | The implementing agent rebases                                                                                            |
| Flaky test     | One re-run; if it passes, open a `flaky-test` issue                                                                       |
| Behind `main`  | `automerge.sh` runs `gh pr update-branch` and waits for the new CI                                                        |

GitHub "Allow auto-merge" is off, and merges made by `GITHUB_TOKEN` would not trigger the main CI
that deploys, so merges run locally under the owner's `gh` login.

## Model routing

| Work                                                    | Model                                              |
| ------------------------------------------------------- | -------------------------------------------------- |
| Orchestrator: triage, epic split, `risk:high` decisions | Opus                                               |
| Implementation `risk:low` S/M                           | Sonnet                                             |
| Implementation `risk:high`                              | Sonnet + independent review by Opus subagent/Codex |
| Search, log reading                                     | Explore agent (Haiku)                              |
| Mechanical work                                         | Plain `gh`/shell scripts, no model                 |
| Second opinion, parallel capacity                       | Codex                                              |

## Escalation ladder

Attempt 1: Claude Sonnet. Attempt 2: Claude Sonnet with the attempt-1 log tail as `{{EXTRA}}`.
Attempt 3: Codex. A failure at attempt 3 sets `needs-human` with a comment; for `risk:high` the
orchestrator may choose one Opus attempt. A failed attempt gets `agent-failed` plus a comment with the
last log lines (token-like strings redacted); the next runner invocation retries it.

## Token rules

- No whole-file reads: grep or read line ranges. Write large outputs to disk and grep them.
- `gh` always with `--json`, `--jq`, `--limit`. Never loop `gh project item-list` (rate limit).
- No polling: use background waits. Subagent reports at most 10 lines.
- Fresh session per issue; write a handoff file at about 60 % context.
- `--max-turns`: S 25, M 40; L is split instead of run.

## Codex

CLI `codex exec` (v0.160, logged in via ChatGPT, model from `~/.codex/config.toml`) reads
`AGENTS.md`, which points to CLAUDE.md. Codex never merges and passes the same gates. Branch
`codex/issue-N`, log `logs/queue/issue-N.codex.txt`.

## Ponytail and CLAUDE.md

Core rules: [ponytail-summary.md](ponytail-summary.md). Conflict: Ponytail's "one small check, no
per-function suites" is overridden by the queue rule "a test for every acceptance criterion" and by
CLAUDE.md ("write tests first" for calculations). CLAUDE.md and the guardrails win.

## Known limitations

- All agents act under the owner's GitHub account, so who set `tests-change-approved` cannot be
  enforced technically. It is a rule by instruction; label events are auditable in the issue timeline.
- Repo settings, the ruleset and secrets are owner-only. For server-side auto-merge the owner would
  enable "Allow auto-merge" and add a fine-grained token so merges trigger CI.
- Failed attempts retry automatically up to attempt 3; a broken environment (for example a
  logged-out CLI) burns them quickly.

## Restart and troubleshooting

State is in labels and PRs; run the runner again.

- Issue stuck `in-progress` after a crash: remove the label and `git worktree remove --force <repo-parent>/wt/issue-N`.
- Nothing starts: check `--dry-run` output (area lock, `in-progress` count against `--max-parallel`, open PR on `agent/issue-N`).
- Missing-label errors: run `labels.sh`.
- Board warnings: run `gh auth refresh -s project`.
- Logs: `logs/queue/` (git-ignored).
- Merged but issue still open: `live.sh` waits for the deploy; check `/health` revision and the deploy workflow.
