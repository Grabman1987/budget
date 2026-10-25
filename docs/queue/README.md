# Delivery process

This is the single authoritative source for queue work: roles, tests, review, integration and issue status. Product, finance, design and security requirements remain in [`SPEC.md`](../../SPEC.md), [`DESIGN.md`](../../DESIGN.md) and `CLAUDE.md`. Historical decisions and prompts are superseded where they conflict with this process.

## Work and coordination

Start with the next ready integration candidate and continue it through publication before starting more work. Existing advanced work has priority. Normally one issue maps to one branch and PR; closely related issues may share a small PR only when each issue's scope and acceptance are clear. Do not create mixed backlog branches or duplicate board entries. Inspect any prepared test diff or relevant existing evidence before recreating work. Preserve existing changes and approvals; do not interfere with other worktrees, branches, PRs or issues outside the assigned scope.

At most two implementation packages may be active, plus one independent reviewer when needed. Do not reserve an extra infrastructure lane. Resolve dependencies before dispatch. Use one writer per shared file or migration sequence, and run at most one heavy test job at a time. When ready work is waiting, do not start more implementation.

Choose a model for the task: Astra coordinates and handles difficult diagnosis or high-risk decisions; Sol handles normal bounded implementation; Luna or the least costly suitable available model handles simple research and changes. Use only available models. State the actual execution path (cloud agent, local agent, or independent reviewer); do not claim a tool or model was used if it was not. Implementer and reviewer must be different agents. Independent Codex review is allowed; no specific vendor model is required. Financial, security and migration changes need a capable independent full-diff review.

Give each agent only the task, owned files, acceptance criteria, dependencies and relevant approvals it needs. Keep one compact coordination record: ticket, branch, commit, verified revision, dependency and next step. Keep reports short and include evidence. Ask only about new product decisions, missing necessary permissions or protected-rule changes; bundle necessary questions, do not repeat answered questions, and continue independent work. After two failed diagnostic approaches, record the cause, evidence and next needed action; use a permitted alternate route or continue independent work rather than looping.

## Tests and local checks

Use suitable existing tests to cover acceptance criteria. Do not create a test solely to satisfy a documentation rule. For a calculation defect, reproduce it with a literal expected result independent of the implementation and write or update that regression check before changing the calculation. Implementers may make necessary technical edits to existing tests for an authorized UI/API change, including selectors and labels, table or dialog structure, expanding details, and fixtures for new read queries or approved upload fields. This permission includes files containing finance tests when protected expectations remain unchanged; it does not authorize changing their financial meaning.

For each changed test file, include a brief per-file reason and have an independent reviewer inspect the change and its effect on coverage. No new owner approval is needed for these scoped technical adaptations; after the scope and review are documented, the orchestrator may set `tests-change-approved` to record them. Existing explicit approvals remain valid. Changes to financial oracles, booking semantics, security, locks, audit, undo, tolerances, timeouts, or weakening/removing/skipping checks require separate owner approval. Never loosen timeouts, skip tests, or weaken coverage to get a green result.

Run affected tests and static checks while implementing. A reviewable PR may be opened after suitable targeted local checks; `npm run check` does not have to pass locally before every PR. Before merge, every required check must pass on the exact PR head. Compare CI coverage with the required check set: when CI covers it all, an identical local full run is not routinely needed; run only uncovered checks locally. Use a local full run when risk or diagnosis warrants it. Finish code, necessary test changes and docs before the full CI run where possible. Reuse evidence only for the revision it tested or for relevant content proven unchanged. Diagnose failures before retrying; do not report old results as current CI.

Owner authorization (2026-10-25): CI now selects checks by the committed changed-file scope, using `scripts/ci/change-plan.mjs`. Documentation-only changes retain static, Docker and restore checks. Explicitly mapped UI changes also retain all Linux unit/API tests and the mapped browser flows, including their screenshot assertions and configured profiles. Unknown files, shared code, calculations, database/auth code, tests/baselines, dependencies and workflow changes require the full suite. The initial UI scope is only the funding-plan component and its stylesheet. Do not infer that every UI change is on the fast lane. Expand mappings only with independently reviewed coverage evidence.

Keep all four required GitHub check names and branch protection. Required aggregates must fail on missing plans and unexpected skipped, cancelled or failed jobs. Full regression remains scheduled nightly and manually runnable, without deploying. No financial/security oracle, timeout or assertion is relaxed by selecting the affected checks. The owner-authorized scope selection supersedes the earlier requirement to run every suite for every PR; all other protections and exact-head integration gates remain. See the [practical local/cloud guide](../development-fast-path.md).

Separate implementation/preview from publication: a PR can be ready for user review before the full delivery gate completes. Do not duplicate a full CI run locally or repeatedly rebuild evidence after an unrelated documentation edit. On actual failures distinguish infrastructure, contract/fixture and product failures before a targeted retry. Use the five-task timing pilot in the guide to measure the change; do not claim an unmeasured speedup.

## Review and risk

Every completed change gets an independent review of the final diff. For a small change, a short explanation and relevant evidence are enough. After edits, review the affected portion again unless the change has wider effects. Existing-test changes always need independent review; financial, security and migration changes need a capable reviewer of the complete diff. The reviewer must not be the implementer.

| Risk      | Examples                                                                                             | Review and gates                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Routine   | Copy, layout, documentation                                                                          | Independent diff review and required CI                                              |
| Elevated  | Existing tests or baselines, shared components                                                       | Above, with focused review of test/baseline impact                                   |
| High      | Money, ledger, database, auth, migrations, CI, deploy or queue scripts                               | `risk:high`, capable independent full-diff review, required CI and integration gates |
| Protected | Calculation semantics, security/locking/undo behavior, production data, secrets or branch protection | Separate owner approval before the protected change; preserve all existing gates     |

If a technical change crosses risk levels, follow the higher level. Routine technical test adaptations described above do not become protected changes unless their semantics alter protected expectations.

## Screenshots and UI evidence

For an intended UI change, regenerate only the affected screenshot specs using `update-snapshots.yml` and its `specs` input (for example `e2e/shell.spec.ts`). Inspect the resulting PNGs against the intended change before merge. The bot push does not start CI; after verifying it contains only intended baselines, push an empty commit to trigger checks on the new head. Never regenerate all baselines to get green. Limit evidence to affected views and needed desktop/mobile profiles; browser emulation is not a physical-device test.

## Integration and deployment

Normal serial merges and deployments by the orchestrator are preauthorized once independent review, required checks and existing integration conditions pass. Implementers do not merge. Use only `scripts/queue/merge-pr.sh <pr>` for integration; do not use direct GitHub merge, auto-merge or bypass flags.

The script enforces the existing gates: `main` CI and deployment green for the current head, `/health` reporting that exact live main revision, required PR CI on the exact head, a fresh main/live gate before merge, and live `/health` verification after merge. Keep merges serial: start the next only after the previous merge is live. Stop on a failing main check, a changed head, a failed post-merge main check, or a deployment that does not become live. Do not bypass or weaken branch protection, or force-push or rewrite history.

Do not perform destructive production operations. Migrations must be reversible and tested on a copy first. Never expose secrets, private financial data, raw logs, or real PDFs in code, issues, PRs, or public evidence. Share only synthetic evidence needed for review and make it accessible to the next agent. Suspected data loss or a security issue means stop and open an `incident` issue. No production secrets, credentials, settings, or deploy configuration changes without separate owner approval.

## Issue status and unattended loops

Set `in-progress` when work starts and record a concrete blocker when it stops. Set live/complete status only after publication is verified and every acceptance criterion is met, including any explicitly required profile such as `webkit-iphone`. The orchestrator sets `queue:complete` on the PR after all criteria pass and the merge is live. Do not close a parent or epic solely because its children closed. If board access is missing, record the needed reconciliation and do not claim the board was updated. Otherwise, board evidence should describe actual work and publication; do not create duplicate entries. PRs say `Refs #N`, never `Closes`.

The unattended `loop.sh`, `automerge.sh`, `run_queue.sh` and `live.sh` workflows remain disabled. Existing STOP files are binding; the unresolved STOP must not be cleared. Do not start, schedule, or invoke those loops without separate owner approval. This authorization for normal serial integration does not release STOP files or authorize unattended loops.

## Labels and references

Useful labels include `ready`, `needs-human`, `blocked`, `epic`, `in-progress`, `ui-change`, `incident`, `flaky-test`, `risk:low|high`, `area:*`, `size:S|M|L`, `tests-change-approved` (scoped technical adaptations after justification and independent review), and `queue:complete` (only after live acceptance). Create labels with `bash scripts/queue/labels.sh` when needed.

Use `rg` or line ranges for focused reading; use `gh` with `--json`, `--jq` and `--limit` where practical. Do not poll in tight loops. Follow the minimal-code principles in [the Ponytail summary](ponytail-summary.md), while this document governs delivery and test policy.
