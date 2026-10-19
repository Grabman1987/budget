# Delivery process

How work reaches `main` and production today (state 2026-10-19). Measured numbers:
[delivery-audit-2026-10-17.md](delivery-audit-2026-10-17.md), CI layout: [ci-speed.md](ci-speed.md).
`CLAUDE.md` holds the hard guardrails and wins on any conflict.

## Process

1. The owner or the orchestrator writes a small issue (acceptance criteria, `risk:*`, `area:*`, file scope).
2. The orchestrator (Opus or Codex, interactive session) dispatches implementation to an agent in its own worktree and branch.
3. The agent implements, runs targeted checks, opens a PR with `Refs #N` and stops. It never merges.
4. CI runs on the PR. The orchestrator checks scope, reviews as the risk class requires (below) and merges with `scripts/queue/merge-pr.sh <pr>`.
5. The issue closes only when the merge is live and every acceptance criterion is verified (closing rules).

## Roles and lanes

| Who                          | Does                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Orchestrator (Opus or Codex) | Triage, dispatch, scope check, test-change decisions, merges, sets `queue:complete`                                  |
| Implementer                  | One issue, one PR; no merge, no `queue:complete`, no `tests-change-approved`                                         |
| Search, log reading          | Small models (Explore/Haiku) or plain `gh`/shell                                                                     |
| Independent reviewer         | Independent Opus or Codex agent, never the implementer; reviews the same full diff, not the implementer's conclusion |

- At most 2 feature lanes at once: **A** UI, Plan, Konten; **B** finance, data, API. Plus 1 infra slot **C** (CI, scripts, docs).
- One writer per critical area at a time: `router.tsx`, shared components in `packages/ui`, ledger, migrations. Queue the second issue instead of running it in parallel.

## Risk classes

| Class    | Examples                                                       | Needs                                                                    |
| -------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| LOW      | UI copy/layout, docs, no existing test touched                 | Green CI and the orchestrator's scope check. No separate long review.    |
| MEDIUM   | Existing tests or baselines change, shared components          | LOW plus independent review of the test and baseline changes             |
| HIGH     | Money, ledger, DB, auth, migrations, CI, deploy, queue scripts | Label `risk:high`, independent Opus or Codex review of the whole diff    |
| CRITICAL | Calculation rules, production data, secrets, branch protection | Documented owner approval first; migrations reversible, tested on a copy |

Unsure means one class higher. Independent review is mandatory for every change to existing tests and for `risk:high`.

## Test-change policy

Owner decision (Fabian, 2026-10-17): "Test changes for already decided UI changes are allowed if each change traces to a documented owner decision and is justified per test file in the PR; old expectations on text/structure/interaction may be replaced by matching checks of the new behaviour with coverage kept; an independent Opus review checks them before merge. Not covered: looser tolerances, skip, disabled rules, lower coverage, removed checks without equivalent replacement. Changes to finance, security, locking and undo rules stay separately subject to owner approval."

Owner model/integration authorization (2026-10-19, [#694](https://github.com/Grabman1987/budget/issues/694)): "Ja, Codex-Reviews und reguläre Integration erlauben". An independent Codex reviewer may replace the named Opus reviewer with the same full-diff scope, including existing-test/baseline and high-risk changes; the reviewer must never be the implementer. This supersedes the named-model restriction in the historical decision above, preserving all its test-change conditions. The owner also authorizes subsequent serial merges through the existing required CI and main/live gates, including regular deployment by the orchestrator. Implementers still never merge. Role separation, required checks, branch protection and closing criteria remain binding; this authorization does not enable the old queue loops or release binding STOP files.

- Implementing agents never edit existing tests (`*.test.*`, `e2e/**/*.spec.ts`, tolerances, lint or coverage config). They add tests for new criteria and list the existing-test changes they need in the PR.
- The orchestrator applies a listed change only under the decision above: per-file justification table (file, change, decision cited), independent review, label `tests-change-approved`.
- The orchestrator sets `tests-change-approved` only for issues the owner approved in chat; the PR quotes that approval.
- Tests guarding finance, security, locking or undo always need the owner's explicit approval for that specific change.
- Not covered by the decision (explicit owner approval for that PR): looser tolerances, `skip`/`only`, disabled lint rules, lower coverage, removed checks without an equivalent replacement.
- Isolation or root-cause fixes that make a test stricter follow the same review and table.
- Obsolete test with no matching decision: `needs-human`, reason in a comment.

Residual limitation: `checkScope` protects existing `*.test.*` and `e2e/**/*.spec.ts`
files, but test helpers and fixtures with other names (for example `test-utils.ts`
or `fixtures/data.ts`) can still weaken what tests verify without triggering that
existing-test guard. This is caught only by orchestrator review: Opus must inspect
helper/fixture changes and their effect on the tests before integration. The guard
does not establish that test coverage or assertions remain equally strict.

## Screenshot baselines

Intended UI changes regenerate only the affected specs on the PR branch: run `update-snapshots.yml` with the `specs` input (for example `e2e/shell.spec.ts`). The orchestrator opens the new PNGs and judges them before the merge. The bot's push does not start CI, so push an empty commit afterwards. Never regenerate all baselines to get green.

## Merging

`scripts/queue/merge-pr.sh <pr>` (orchestrator, local `gh` login):

1. Waits until `main` is green, deployed and live (`/health` revision equals the main head).
2. Updates the PR branch once if it is behind.
3. Waits for CI on the exact PR head, then re-checks the gate and the main head.
4. Merges `--squash --match-head-commit`, then waits until the merge commit is live.

One merge per live revision: the next merge starts only after the previous one is live. Main CI reuses the validated identical PR tree (PR #657): merge to live took about 2.5 min instead of 11 min. Exit codes: 0 live, 1 stopped before the merge, 2 main CI failed after the merge, 3 not live after 45 min.

## Closing rules

- Close an issue only when every acceptance criterion is verified (including `webkit-iphone` where the issue names it) and the merge is live. The orchestrator then sets `queue:complete` on the PR.
- Partial delivery: comment "live in <rev>, open items" and leave the issue open.
- Epics and parents never close because their children closed.
- PRs say `Refs #N`, never `Closes`: closing means live, not merged.

## Labels

`ready`, `needs-human`, `blocked`, `epic`, `in-progress`, `ui-change`, `incident`, `flaky-test`, `risk:low|high`, `area:*`, `size:S|M|L`, `tests-change-approved` (orchestrator, per policy), `queue:complete` (orchestrator, after live). Create the set with `bash scripts/queue/labels.sh`.

## Unattended loop: not in use

`loop.sh`, `automerge.sh`, `run_queue.sh` and `live.sh` (with `gate.sh`, `policy.mjs`, `scope-lib.sh`, `board.sh`) are **not in use; restart only with owner approval.** The owner made STOP files binding, and an unexplained STOP on 2026-10-17 16:36 is unresolved. Do not start, schedule or call them from CI. The protected-path list in `policy.mjs` (`.github/**`, `scripts/queue/**`, `scripts/ci/**`, `.claude/**`, `.agents/**`, `AGENTS.md`, `CLAUDE.md`, deploy files, migrations, test and lint configs, lockfiles, snapshot directories) still tells the orchestrator what to review by hand.

## Cost rules

grep or line ranges instead of whole files; `gh` with `--json`/`--jq`/`--limit`; no polling loops; agent reports at most 10 lines; a handoff file at about 60 % context. Ponytail for code ([ponytail-summary.md](ponytail-summary.md)); "a test per acceptance criterion" wins over its "one small check".

## Troubleshooting

- `gate: main not live/green yet` for long: check the last `ci.yml` and `deploy.yml` runs on `main` and the `/health` revision. A red main blocks all merges until fixed.
- `CI red <sha> run <id>`: read the listed specs, fix on the branch, push, run the script again.
- `main moved, stop`: another merge landed; run the script again.
- `MAIN CI FAILED on merge`: stop all merges, fix forward or revert, tell the owner.
- No CI on the head after a bot push (baselines): push an empty commit.
- "cannot lock ref" or transient `gh` errors: the script retries three times; if it persists, look for a parallel `git` process in the same checkout.
- Leftover worktree of a crashed agent: `git worktree remove --force <path>`, then delete the branch.
- Limitation: all agents act under the owner's GitHub login, so `tests-change-approved` cannot be restricted technically. It is a rule by instruction; the label event is auditable in the timeline.
