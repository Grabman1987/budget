# Current status

Updated 2026-10-01. Audit baseline: `main` at `c213bab`; all ten follow-up fixes are integrated in reviewed main `665b52e` (PRs #71–#90). The historical baseline evidence below is preserved. Owner decisions and operations observations are identified separately. `SPEC.md` defines scope and acceptance; `ROADMAP.md` holds task checklists. [FEATURES.md](FEATURES.md) maps complete V1 coverage; [REQUIREMENTS-GAPS.md](REQUIREMENTS-GAPS.md) tracks remaining requirement details.

## Implementation and acceptance

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
| 2: YNAB account/month and mapped-category reconciliation | Real EUR migration committed live on 2026-10-02 with `migrate-cli.js` (ops.md §12): export as of 2026-10-02, start 2023-10, 19 accounts, 7,051 bookings, 0 problems; balances, activity and totals without difference; written ledger vs. import 0; 67 `available` differences, all in five n:1-merged target categories (documented merge effect). Owner acceptance of the reconciliation pending |
| 3: holdings and returns match Portfolio Performance | Pending private PP transfer and comparison |
| 4: parallel month-end without differences | Pending required scope and month-end comparison |

## Owner decisions and operations

- **First real import: EUR only** (2026-10-01). Full FX support remains later scope. Unsupported foreign-currency budget accounts must not silently enter EUR sums; A03 guard and EUR account overview are integrated; detailed FX workflows remain open.
- **No app import feature** (2026-10-01). Only CSV export of all accounts/portfolios stays in scope, initially as a placeholder. One-time migration remains a separate owner-authorized Codex/Claude task using existing exports and the PP file in private storage. File access and transfer procedure remain to be established; parser/API existence does not make import an accepted product feature.
- The old Fly app was used only for the prototype. The owner removed it on 2026-10-01 and supplied successful deletion output and a subsequent app list without it. This retirement does not establish any financial migration gate.
- The configured target app is reported as `deployed`; legacy staging remains `suspended`. Staging and shared storage/tokens have not been authorized for deletion.
- Health and exact live revision `665b52e3cf4e4ece0afa1bbe7f9e19aae67e2c17` were independently verified after all four Main-CI jobs and actual Deploy/one-machine-guard steps passed. [Main CI](https://github.com/Grabman1987/budget/actions/runs/36888951919), [Deploy](https://github.com/Grabman1987/budget/actions/runs/36892137207). Physical phone/desktop passkeys, recovery and real encrypted backup download/restore remain unverified. Follow [the runbook](ops.md).
- `design/prototype` and `design/screens` remain the design reference. Legacy calculation references stay until their remaining porting work is understood.

## Audit evidence, 2026-10-01

The audit used synthetic in-memory databases and did not modify production data. Ten reproduced cases are recorded in [the follow-up audit](audit/2026-10-01-follow-up.md).

- `npm run check`: typecheck/lint passed; 1,237 tests passed, two initially skipped for missing `age`. With `age` and `BUDGET_REQUIRE_AGE=1`, the backup suite passed all five tests, including those two cases.
- Production and E2E builds passed.
- Full browser run: 160 passed, 18 failed, 27 skipped. Seventeen failures were screenshot comparisons under system Chromium 151 instead of the intended Chromium 141; these remain unresolved visual checks. One immediate system-theme assertion fluctuated (one pass, two failures on isolated repetition).
- Docker build did not complete because the container could not resolve Debian package hosts. No successful image build or live health check was established here.
- Dependency audit: four moderate affected packages in one development-tool chain, no high/critical advisories; not four independently demonstrated production vulnerabilities.

These describe the audited baseline, not every future commit. Repeat required checks for each change. Mocked encrypted-backup tests do not replace the owner's real restore check.

## Next work

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
