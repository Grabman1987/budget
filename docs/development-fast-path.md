# Fast implementation, separate verification and publication

Owner-authorized delivery change, 2026-10-25. The authoritative rules remain in
[the queue process](queue/README.md). This is a practical guide, not another policy.

## Where to work

| Work | Environment |
| --- | --- |
| Bounded code/UI task with synthetic data | Prepared Linux cloud workspace or isolated local worktree |
| Private Dropbox files, spreadsheet inputs, local integrations | Local worktree; keep data outside Git |
| Windows file chooser or physical-device defect | The affected local device; Linux evidence is insufficient |
| Required cross-platform checks and publication | GitHub Actions, then the existing serial integration helper |

Cloud is optional. It reduces repeated machine setup and isolates work; it does not
make the same test matrix intrinsically faster. No cloud environment is claimed to
have been configured by adding this guide.

## Prepared cloud environment

Choose `Grabman1987/budget`, branch `main`, Node 22 (24 is also supported), and use:

```sh
bash scripts/dev/setup-cloud.sh
```

Run this once while preparing/publishing the environment. It installs locked npm
dependencies, age, Chromium, WebKit and their Linux dependencies. Setup needs network
access to the existing npm/OS/Playwright package sources. Reprepare after lockfile,
Node or browser-version changes; do not install all browsers again before every task.
Do not add production tokens, real PDFs, database copies or private provider data.
Normal implementation needs only repository files and synthetic fixtures.

Paste this task prompt into that environment, replacing the bracketed issue:

> Implement [issue number and one-sentence acceptance case] in Grabman1987/budget.
> Read AGENTS.md and the relevant task; use docs/queue/README.md as the delivery rules.
> Inspect existing branches/PRs before duplicating work. Make one bounded change and
> use synthetic data. Run affected checks once, fix actual failures, and open a PR
> with the result and evidence. Do not repeat the entire test suite locally when CI
> covers it. Arrange independent diff review. Do not merge or deploy from the cloud
> implementer: return the PR, head SHA, checks and any acceptance gap to the local
> orchestrator. Do not change production data or restart unattended queue loops.

At most two implementation packages are active, including local work. A cloud task
is one of those packages, not an additional lane. Keep shared-file ownership explicit.

## Preview before publication

Use the existing development server for interactive review. In a fresh isolated
checkout without private `.env` files, install dependencies and seed synthetic data:

```sh
npm ci
npx tsx scripts/db-seed.ts
npm run dev
```

The seed command refuses to overwrite an existing database. Do not use `npm run
db:seed` casually: that convenience command includes `--fresh`. Open the localhost
URL printed by the dev server, and use its temporary setup token to register a
development passkey. This is a local preview, not a publicly hosted preview service.
Cloud browser evidence can instead use the existing Playwright fixture servers;
they create synthetic databases and exercise the existing authentication setup.
Native Windows interactions still need the Windows machine.

A previewable result and a production release are different milestones. Keep the PR
open while preview/acceptance work is ongoing. Only the orchestrator publishes through
`scripts/queue/merge-pr.sh`; this first rollout retains automatic deployment after a
verified merge. No extra Fly application, public preview host or production setting
has been created. A hosted preview would be a separate infrastructure change.

## Check selection

After committing the bounded change, inspect the same plan that CI uses:

```sh
node scripts/ci/change-plan.mjs origin/main HEAD
```

This command reads committed changes, not unstaged edits. It reports paths relative
to the PR merge base and treats both sides of a rename as changes. Unknown paths,
test changes, workflow changes and unavailable comparison evidence select `full`.
The local command cannot read GitHub labels: set environment variable `HIGH_RISK=true`
when reproducing a high-risk PR's plan locally.

| Lane | Required coverage |
| --- | --- |
| `docs` | Workspace typecheck/lint/format, Docker smoke and restore test; no unit/browser/Windows reruns |
| `ui` | Above plus all Linux unit/API tests and mapped Playwright specs with screenshot assertions and configured profiles |
| `full` | Existing complete Linux/Windows, 12 browser shards, visual, Docker and restore coverage |

The initial UI allowlist is intentionally limited to `wealth/funding-plan.tsx` and
`wealth/funding-plan.css`. It runs `funding-plan.spec.ts` and `savings-plans.spec.ts`.
These specs currently capture screenshots for inspection; they do not contain
baseline comparisons. The focused command does not disable screenshot assertions
if any are added later (changing a spec itself still selects `full`).
Changing the calculation, persistence, shared savings form, test files or another
UI module selects `full`. Required checks retain their names and reject unexpected
skips/failures. Adding another UI area needs an independently reviewed source-to-test
mapping, not a label that bypasses checks. `risk:high` overrides the file mapping and
forces full coverage. Set it before the final push; if review raises risk afterward,
push an empty commit to include the label in a fresh CI event. Editing the label alone
does not restart CI. No assertion or timeout was weakened.

Browser/Windows jobs wait for static checks to pass. This avoids paying for a whole
browser matrix when typechecking is already broken; on successful full runs it adds
the static job to that critical path. Linux unit tests still run alongside static.
Full audits run nightly at 02:17 UTC and can be started with **Actions → CI → Run
workflow**. These audits never execute deployment; the follow-up Deploy workflow
may be entirely skipped. The merge gate ignores entirely skipped Deploy runs while
retaining the newest run not explicitly concluded skipped, including failures and pending runs. A failed audit is investigated
before another integration. A push to main may reuse an identical validated PR tree;
scheduled/manual audits always run the full suite.

## Five-task pilot and failure handling

Use the next five genuinely ready small tasks; do not invent edits just to measure CI.
Prefer documentation or planner presentation changes for the initial fast lanes.
Record one line per task in its PR: lane, implementation-ready time, CI start/end,
reruns and reason, merged/live SHA. Target at most five minutes of mandatory CI wait
for a fast-lane change; this is a target, not a measured guarantee. Report queue delay
separately from execution. Full-risk tasks are not scored against that target.

Diagnose once before retrying: package/network failure → retry only the failed job;
type/API contract failure → fix code/fixture together; assertion failure → investigate
the behavior. Two unsuccessful approaches require a concise cause/evidence/next-step
record. Do not repeatedly run the same full suite or weaken an expectation to get green.

Board state describes actual work. A merged child does not complete a parent or a
physical-device acceptance check. Close/reconcile cards only after their acceptance
is met; blocked/unattended historical branches do not consume active implementation
slots unless someone is actually working on them.
