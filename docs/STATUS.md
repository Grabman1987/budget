# Current status

Updated 2026-10-01. Audit baseline: `main` at `c213bab`; follow-up changes are recorded below. Owner decisions and operations observations are identified separately. `SPEC.md` defines scope and acceptance; `ROADMAP.md` holds task checklists.

## Implementation and acceptance

Checked roadmap boxes record implemented work. They do not prove owner acceptance, a live deployment's commit or absence of later defects. A prototype, API and usable application page are separate deliverables.

| Area | Implemented | Still open |
| --- | --- | --- |
| Foundation | SQLite, design primitives, shell, passkeys/recovery, audit/undo, backup code, CI/deploy configuration and P1 audit fixes | Gate 1 sign-off, outstanding P1 checklist items and operational verification |
| Accounts and budget | Accounts, bookings, capture, splits/transfers, categories and Plan › Monat | Follow-up correctness fixes before migration acceptance |
| Migration tooling | Parser, mapping, staging, dry run, commit/re-import/undo and server/worker modules retained; app import UI removed | Separate agent-assisted migration requires private file access, transfer procedure and Gate 2 |
| Planning | Expected payments, goals and rules UI; Heute domain/API | Heute page is a placeholder; full contacts, inbox and year-planning UI |
| Data sources/export | Market adapters; data-sources frame and CSV-export placeholder; no upload/wizard/report in the app UI | CSV download intentionally not implemented; bank sync, assignment rules, worker and live adapters |
| Wealth | Net-worth UI, investment APIs, valuation/performance domain and PP XML parser | Portfolio/debt/freedom pages are placeholders; PP commit/matching/report, Gate 3 and A02/A09/A10 |
| Reports/PWA | Report catalog and navigation | Report bodies, explorer/printing, offline queue/service worker and Gate 4 |

Evidence: [router](../apps/web/src/router.tsx), [report pages](../apps/web/src/pages/reports-pages.tsx), [roadmap](ROADMAP.md), [market-source limits](market-data.md). The shell inbox count is currently static ([source](../apps/web/src/shell/inbox.ts)).

| Gate | Status |
| --- | --- |
| 1: owner accepts specification/design | Pending explicit sign-off |
| 2: YNAB account/month and mapped-category reconciliation | Pending corrections and separate private migration/comparison |
| 3: holdings and returns match Portfolio Performance | Pending private PP transfer and comparison |
| 4: parallel month-end without differences | Pending required scope and month-end comparison |

## Owner decisions and operations

- **First real import: EUR only** (2026-10-01). Full FX support remains later scope. Unsupported foreign-currency budget accounts must not silently enter EUR sums; that guard is still open (A03).
- **No app import feature** (2026-10-01). Only CSV export of all accounts/portfolios stays in scope, initially as a placeholder. One-time migration remains a separate owner-authorized Codex/Claude task using existing exports and the PP file in private storage. File access and transfer procedure remain to be established; parser/API existence does not make import an accepted product feature.
- The old Fly app was used only for the prototype. The owner removed it on 2026-10-01 and supplied successful deletion output and a subsequent app list without it. This retirement does not establish any financial migration gate.
- The configured target app is reported as `deployed`; legacy staging remains `suspended`. Staging and shared storage/tokens have not been authorized for deletion.
- The running commit, physical phone/desktop passkeys, recovery and real encrypted backup download/restore remain unverified. Follow [the runbook](ops.md); an app-list status proves none of these checks.
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

App import UI is removed; CSV export remains a placeholder. A07 exact lead amounts, A06 categorized income, A01 trade settlement integrity, A08 booking currency invariants and A05 payment lifecycle are implemented with regression coverage. Next correct the EUR-first guard (A03), cross-account currency aggregation, and private Gate-2 reconciliation (A04). Each task gets its own branch/PR and independent expected values. Review the intended browser environment before approving UI changes.

Complete daily workflows and wealth aggregation/FX, private PP transfer/Gate 3, then remaining sources/reports/PWA and Gate 4. Establish private file access and transfer procedures before processing the owner's exports. Do not retire still-used finance tools merely because the prototype host has been removed.
