# Current status

Updated 2026-10-08 against main `5193b0a930656be210e6b447bfd0e8de8c9846a0`. The live health revision was checked on the same date and matched this source exactly. [Acceptance matrix](ACCEPTANCE.md) separates connected implementation, deployment evidence and remaining acceptance. [SPEC](../SPEC.md) still defines scope and source precedence; [ROADMAP](ROADMAP.md) retains task-specific checklists.

## Verified source and deployment

- [Main CI](https://github.com/Grabman1987/budget/actions/runs/37579643500): eight successful jobs (unit, check-windows, restore-test, docker, three E2E shards and check).
- [Deploy](https://github.com/Grabman1987/budget/actions/runs/37580927198): both the actual Deploy step and the one-machine guard succeeded.
- [Live health](https://budget-fg.fly.dev/health): `status: ok`, `revision: 5193b0a930656be210e6b447bfd0e8de8c9846a0` on 2026-10-08. This observation identifies the running image; a green PR or a workflow with a skipped deploy does not.

These are evidence for this source snapshot. They do not accept private balances, returns, physical-device workflows or restoration of a real backup. This documentation update itself has not yet been merged or deployed.

Dependency audit snapshot (2026-10-08, unchanged lockfile): `npm audit` reports seven affected package entries (four moderate, one high, two critical). The two critical entries are the same development-tool chain, `concurrently` → `shell-quote` ([advisory](https://github.com/advisories/GHSA-pqg4-j6r4-53mv)); `npm audit --omit=dev` retains one high `source-map-js` entry ([advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)). Counts are package/advisory reports, not independently demonstrated production exploits. Review the existing dependency PRs and remaining lockfile/runtime exposure separately; no forced dependency update is part of this documentation change.

## Connected implementation and remaining acceptance

| Area | Present in the verified source | Remaining work / acceptance |
| --- | --- | --- |
| Foundation | SQLite, shared domain/UI packages, shell, passkeys/recovery, audit/undo, encrypted backup and CI/deploy infrastructure | Complete Gate 1/design/device acceptance; actual recovery and encrypted restore evidence |
| Accounts and budget | Account registers, capture, splits/transfers, categories, envelopes, monthly planning and money distribution | Gate 2; private account/month/category comparison; truthful plan/cash/coverage labels and device acceptance |
| Planning | Heute, annual planning/events, recurring payments, contacts and goals | Income-replacement scenarios, residual audit findings, routine/design/device acceptance |
| Inbox and search | Categorization, confirmation, assignment suggestions and learning; existing global search | Extended search #249/#252, current/history filtering, warning grouping and complete paging/cache acceptance |
| Sources | Market/FX timers, bank adapter, crypto read source, document/payslip intake and separate bank/PDF worker | Each real source's authorization/configuration and reconciliation; complete 14-night operational acceptance |
| Investments and wealth | Portfolio, instrument/trade capture, settlement, savings schedules and execution confirmation, dated asset classes/targets, net worth, debts and current freedom forecast | Gate 3; full private source history; savings-rate optimization, historical freedom target path and residual scope/UX work |
| Reports | 34 catalog entries, each dispatched to a connected report body, including Explorer and printable monthly/yearly reports | Per-report data coverage, financial/visual/device acceptance and open audit findings; a body is not full acceptance |
| Export | User-initiated CSV ZIP for accounts/portfolios with fresh-passkey step-up | Owner review of archive contents/completeness; not an encrypted application backup |
| PWA/offline | Static shell/service worker and persistent booking queue with retry, idempotency and retained errors | Physical installation/offline/reconnect acceptance; Gate 4 |
| Migration tooling | YNAB and PP staging, dry run, commit/report/re-import/revert/operator paths; no app import wizard | Current private reconciliation and owner sign-off, not a blanket claim that transfer has never occurred |
| Month close | F1 navigation and steps 1–3 | F2 #243 integration, search repair #252, complete parallel month-end and Gate 4 |

Source links and concrete completion evidence are in [ACCEPTANCE](ACCEPTANCE.md). The older [FEATURES](FEATURES.md), [TASKS](TASKS.md), and individual ROADMAP delivery notes include historical claims such as missing PRs, placeholder pages or missing report bodies. Read those against this source snapshot and current PR state; preserve their still-open private/owner criteria.

## Gates and owner evidence

| Gate | Current acceptance status | Next evidence |
| --- | --- | --- |
| 1: specification/design and operational foundation | Complete gate sign-off not established by this review | Remaining design/device, recovery and real restore checklist in [ops](ops.md); iPhone #310 and restore #351 |
| 2: mapped YNAB account/month/category equality | Full current owner sign-off remains open; historical migration execution is distinct from acceptance | #354 is one selected account/month comparison, not acceptance of every account/category/month |
| 3: PP holdings and returns | Independent complete private comparison remains open | #355 holdings, then #356 identical-period/method returns; each comparison is bounded |
| 4: parallel month-end without differences | Open | #357 reviews an existing month-end evidence sheet; do not retire still-used tools from a partial comparison |

Owner source setup is split into #359–#362; current balance confirmation is #358. No secrets or private ledger values belong in these acceptance records. Historical observations below are not silently promoted into fresh sign-offs.

## Ordered next work

The [handoff #365](https://github.com/Grabman1987/budget/issues/365) and [audit register #263](https://github.com/Grabman1987/budget/issues/263) are the current issue inventory. The 2026-10-08 snapshot has 101 open issues and 16 open PRs. Eight PRs have all eight checks successful, five have failed checks and three have merge conflicts with no checks returned at their current heads. Re-read heads and checks before acting.

1. Review/integrate existing repairs and PRs serially: #251 repairs #222; #252 repairs #249; #225/#226/#243 need conflict resolution and checks on their final integration heads. Before merging, establish that no other merge/deploy chain is active, as required by #365. This status refresh does not start another chain.
2. Address P0 #264, #271–#273, #282, #284–#286, #288, #293, #295 and #302. An audit/check task is not automatically a reproduced financial defect; test the existing implementation first.
3. Accept performance/content correctness after #250: #279–#282 and #349. Measure the actual integrated/live revision.
4. Finish the 33 bounded sub-page/dialog/full-width tasks #316–#348, taking the prepared wealth PR #248 into account.
5. Finish real source, device, recovery/restore and financial gate evidence. Only accepted Gate 4 establishes final cut-over.

Closed reference issues and archived aggregate cards mean decomposition, not implementation completion. Board `Live` cards include historical drafts and do not yield a completion percentage. Priority P0/P1/P2 in the newer issue titles is distinct from implementation packages P1–P6.

## Historical status and evidence — 2026-10-01 baseline

The following record is retained unchanged from the previous status document, apart from its heading level. Its implementation/deployment/migration statements describe the earlier observation, not the current source snapshot or a renewed private-data comparison. In particular, old placeholder and next-work statements below are superseded by the current sections above. The historical Gate 2 account is not a claim about the present ledger.

<details>
<summary>Earlier status, gate observations and audit evidence</summary>

Updated 2026-10-01. Audit baseline: `main` at `c213bab`; all ten follow-up fixes are integrated in reviewed main `665b52e` (PRs #71–#90). The historical baseline evidence below is preserved. Owner decisions and operations observations are identified separately. `SPEC.md` defines scope and acceptance; `ROADMAP.md` holds task checklists. [FEATURES.md](FEATURES.md) maps complete V1 coverage; [REQUIREMENTS-GAPS.md](REQUIREMENTS-GAPS.md) tracks remaining requirement details.

### Implementation and acceptance

Checked roadmap boxes record implemented work. They do not prove owner acceptance, a live deployment's commit or absence of later defects. A prototype, API and usable application page are separate deliverables.

| Area | Implemented | Still open |
| --- | --- | --- |
| Foundation | SQLite, design primitives, shell, passkeys/recovery, audit/undo, backup code, CI/deploy configuration and P1 audit fixes | Gate 1 sign-off, outstanding P1 checklist items and operational verification |
| Accounts and budget | Accounts, bookings, capture, splits/transfers, categories and Plan › Monat | Real EUR Gate-2 account/month/category acceptance; native FX detail follow-up |
| Migration tooling | Parser, mapping, staging, dry run, commit/re-import/undo and server/worker modules retained; app import UI removed | Separate agent-assisted migration requires private file access, transfer procedure and Gate 2 |
| Planning | Expected payments, goals, rules, contacts, inbox and Heute UI/API; financial writes refresh the relevant views | Year planning, source/suggestion decisions and private/owner visual/device acceptance |
| Data sources/export | Market adapters; fresh-passkey CSV ZIP download for all accounts/portfolios; no app import UI | Private export acceptance; bank sync, assignment rules, worker and live adapters |
| Wealth | Net-worth UI, investment APIs, valuation/performance domain and PP XML parser | Portfolio/debt/freedom pages are placeholders; PP commit/matching/report, Gate 3 and complete investment workflows; A02/A09/A10 are integrated |
| Reports/PWA | Report catalog and navigation | Report bodies, explorer/printing, offline queue/service worker and Gate 4 |

Evidence: [router](../apps/web/src/router.tsx), [report pages](../apps/web/src/pages/reports-pages.tsx), [roadmap](ROADMAP.md), [market-source limits](market-data.md). Posteingang now has an actual ledger/stored-warning queue, route/panel and shell counter ([source](../apps/web/src/shell/inbox.ts)); categorization/confirmation and warning acknowledgement reuse audited writes and undo. Suggestion decisions, source repair and owner acceptance remain open. The inbox slice passed focused browser/API checks, the age-required full check and root review; CI and exact-revision rollout are recorded separately.

| Gate | Status |
| --- | --- |
| 1: owner accepts specification/design | Pending explicit sign-off |
| 2: YNAB account/month and mapped-category reconciliation | Real EUR migration committed live on 2026-10-02 with `migrate-cli.js` (ops.md §12): export as of 2026-10-02, start 2023-10, 19 accounts, 7,051 bookings, 0 problems; balances, activity and totals without difference; written ledger vs. import 0; 67 `available` differences, all in five n:1-merged target categories (documented merge effect). Owner found Zu verteilen, tracking-account values and scheduled rows off; the fixed importer (branch `fix/ynab-import-fidelity`: envelopes re-derived so Zu verteilen equals YNAB in every month, value adjustments kept, scheduled rows as expected payments, salary expected payment) reconciles the export as of 2026-10-02 11:09 locally with 0 differences in all checks; revert of the live run and re-import pending. Owner acceptance of the reconciliation pending |
| 3: holdings and returns match Portfolio Performance | Pending private PP transfer and comparison |
| 4: parallel month-end without differences | Pending required scope and month-end comparison |

### Owner decisions and operations

- **First real import: EUR only** (2026-10-01). Full FX support remains later scope. Unsupported foreign-currency budget accounts must not silently enter EUR sums; A03 guard and EUR account overview are integrated; detailed FX workflows remain open.
- **No app import feature** (2026-10-01). Only CSV export of all accounts/portfolios stays in scope, initially as a placeholder. One-time migration remains a separate owner-authorized Codex/Claude task using existing exports and the PP file in private storage. File access and transfer procedure remain to be established; parser/API existence does not make import an accepted product feature.
- The old Fly app was used only for the prototype. The owner removed it on 2026-10-01 and supplied successful deletion output and a subsequent app list without it. This retirement does not establish any financial migration gate.
- The configured target app is reported as `deployed`; legacy staging remains `suspended`. Staging and shared storage/tokens have not been authorized for deletion.
- Health and exact live revision `665b52e3cf4e4ece0afa1bbe7f9e19aae67e2c17` were independently verified after all four Main-CI jobs and actual Deploy/one-machine-guard steps passed. [Main CI](https://github.com/Grabman1987/budget/actions/runs/36888951919), [Deploy](https://github.com/Grabman1987/budget/actions/runs/36892137207). Physical phone/desktop passkeys, recovery and real encrypted backup download/restore remain unverified. Follow [the runbook](ops.md).
- `design/prototype` and `design/screens` remain the design reference. Legacy calculation references stay until their remaining porting work is understood.

### Audit evidence, 2026-10-01

The audit used synthetic in-memory databases and did not modify production data. Ten reproduced cases are recorded in [the follow-up audit](audit/2026-10-01-follow-up.md).

- `npm run check`: typecheck/lint passed; 1,237 tests passed, two initially skipped for missing `age`. With `age` and `BUDGET_REQUIRE_AGE=1`, the backup suite passed all five tests, including those two cases.
- Production and E2E builds passed.
- Full browser run: 160 passed, 18 failed, 27 skipped. Seventeen failures were screenshot comparisons under system Chromium 151 instead of the intended Chromium 141; these remain unresolved visual checks. One immediate system-theme assertion fluctuated (one pass, two failures on isolated repetition).
- Docker build did not complete because the container could not resolve Debian package hosts. No successful image build or live health check was established here.
- Dependency audit: four moderate affected packages in one development-tool chain, no high/critical advisories; not four independently demonstrated production vulnerabilities.

These describe the audited baseline, not every future commit. Repeat required checks for each change. Mocked encrypted-backup tests do not replace the owner's real restore check.

### Next work

App import UI is removed; CSV export remains a placeholder. All ten follow-up
correctness findings (A01–A10) are integrated, independently checked and deployed
at the verified revision above. Manual-price audit/undo is locally reviewed in
PR #91; complete wealth capture UI and first-refresh time remain separate tasks.

The owner authorized completing and rolling out all agreed V1 pages/functions.
Proceed through [FEATURES](FEATURES.md) and the roadmap: finish course freshness,
contacts, inbox/search and annual planning; accept the implemented Heute page; complete sources and wealth
workflows; build all 30 report bodies and PWA/offline support. Track actual
implementation separately from private YNAB/PP reconciliation and owner device,
restore, design and month-end acceptance. Establish private file access and
transfer procedures before processing real exports. No still-used finance tool
is retired before Gate 4.

</details>
