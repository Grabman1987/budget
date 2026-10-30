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

Choose `Grabman1987/budget`, branch `main`, Node 22.22.2 or newer in the 22.x line (24.15.0+ in the 24.x line is also supported), and use:

```sh
bash scripts/dev/setup-cloud.sh
```

Run this once while preparing/publishing the environment. It checks the declared Node compatibility through `npm ci --engine-strict`, then installs locked npm
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

A previewable result, verified merge and production release are different milestones.
The owner-authorized continuation adds an authenticated hosted preview at
`https://budget-fg-preview.fly.dev`, isolated from production, with synthetic fixtures,
its own volume/passkeys/secrets, fixture prices and no bank/Dropbox/backup integration.
Its one small machine stops when idle; its 1 GB volume remains allocated. Never put
real data there. Existing synthetic preview data and passkeys survive deployments.
The legacy suspended staging app is untouched. Preview login requires its own first
passkey; the one-time setup token is delivered privately, never in this repository.

Only the orchestrator integrates and publishes:

```sh
bash scripts/queue/merge-pr.sh PR --hold-release
# Repeat for the next independently reviewed PR, after main CI passes.
gh workflow run preview.yml --ref main -f revision=FULL_CURRENT_MAIN_SHA
# Inspect the authenticated preview of this integrated candidate.
bash scripts/queue/release.sh FULL_CURRENT_MAIN_SHA
```

This is a preview of integrated main, not an untrusted PR deployment. Both workflows
accept only the full current-main SHA with its latest successful main CI. They recheck
main before deploying and verify the exact health revision. Production credentials
remain exclusively in the production environment; preview has an app-scoped token in
its own main-only environment. `merge-pr.sh PR` remains a one-shot merge-and-release
shortcut. No automatic release runs after each merge. A held merge is not live; only
mark its PR complete after a released descendant contains it and acceptance is met.
Do not leave a failed/pending release behind and continue merging. Main moving during
integration requires restarting the helper; do not bypass its checks.

For initial environment provisioning use the exact preview config, create one
`preview_data` volume in `fra`, separate random `BUDGET_PEPPER` and setup token, and
an app-scoped Fly deploy token. No production secret is copied. A new preview target
must be built and its auth boundary checked before first publication. Codex cloud
setup remains optional and separate from the hosted app preview.

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

The UI allowlist includes `wealth/price-history.tsx` and its stylesheet, verified by `report-polish.spec.ts` and `portfolio-instruments.spec.ts`, plus `wealth/funding-plan.tsx` and
`wealth/funding-plan.css`. It runs `funding-plan.spec.ts` and `savings-plans.spec.ts`.
These specs currently capture screenshots for inspection; they do not contain
baseline comparisons. The focused command does not disable screenshot assertions
if any are added later (changing a spec itself still selects `full`).
Changing the calculation, persistence, shared savings form, test files or an unmapped
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
workflow**. These audits do not trigger the manual-only Deploy workflow.
The merge gate retains the newest deployment attempt, including failures and pending runs. A failed audit is investigated
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

## Local pre-push gate

Typecheck, lint and unit failures are the cheapest CI failures to avoid: in the CI run sample of
2026-10-20..30 (300 runs of `ci.yml`, 28 failed PR runs inspected by job) they accounted for 15 of
the failing jobs next to the e2e failures. Enable the gate once per clone or worktree:

```sh
git config core.hooksPath .githooks
```

`git push` then runs `scripts/dev/pre-push-check.mjs`: typecheck, ESLint and Prettier on the
changed files, the CSS scale check for stylesheets, `vitest related` for the touched code and a
check for removed identifiers. It adds no required check and changes no CI behaviour; CI decides.

Limits: it checks the checked-out `HEAD` against `origin/main` (not the refs being pushed), runs
unit tests with `BUDGET_REQUIRE_AGE=0`, skips without `node_modules`, and the removed-identifier
check covers literal `data-testid`/`testId` values and quoted multi-segment route strings only; it
does not see visible text, bare report ids or CSS selectors. Use
`node scripts/dev/pre-push-check.mjs --list` to see the plan, `BUDGET_SKIP_PREPUSH=1 git push` to
skip it, or `BUDGET_PREPUSH_ALLOW_REMOVED=<token>,…` for a deliberate leftover (for example a spec
that tests a redirect or 404 for a removed route).
