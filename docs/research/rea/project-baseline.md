# Budget implementation baseline

Baseline: `01a10de8b251f3b3bb05d8a5df6ae534e7d0d631`, retrieved 2026-10-15. Source inspection, not a production acceptance run. Governing files: [SPEC](../../../SPEC.md), [PRODUCT](../../../PRODUCT.md), [DESIGN](../../../DESIGN.md), [AGENTS](../../../AGENTS.md), [working rules](../../../CLAUDE.md). The dated [STATUS](../../STATUS.md) and [ACCEPTANCE](../../ACCEPTANCE.md) snapshots describe older revisions; they must not override inspected code.

## Product and existing decisions

Budget is a private, single-user household PWA combining envelope budgeting, cashflow planning, rules, debts and investment tracking. Phone workflows emphasise capture and attention; desktop workflows emphasise distribution, reconciliation, closing and analysis. Contacts are financial counterparties, not additional authenticated users. UI labels use German de-AT; code and technical documentation use English.

Existing binding constraints materially affect reference-product adoption:

- No in-app file-import wizard. Keep authorized one-time YNAB/portfolio migration in operator tooling; CSV ZIP export is a different existing feature.
- No multi-user linking, tax filing, AI categorization/advice, native mobile application or general Actual compatibility in V1.
- Monetary amounts are integer cents; shared pure domain functions own financial figures. Source fees and withheld taxes are retained, not booked again from analytical tax estimates.
- Default acquisition basis is moving average; FIFO is selectable. A reference product's method must be named and reconciled rather than silently substituted.
- Existing financial gates remain independent: mapped YNAB balances, PP holdings/returns, and a complete parallel month-end are not accepted by this research.
- Owner directives at the top of SPEC override older prose. In particular new manual income capture uses the booking month; Plan has its explicit inspector exception; global search has its explicit palette exception; Vermögen may show its compact performance overview.

## Architecture and connected workflows

| Layer / workflow | Actual evidence | Present behavior and constraints |
| --- | --- | --- |
| Workspace | `package.json`, `apps/*`, `packages/*` | Strict TypeScript npm workspaces; React/Vite frontend, Hono API, SQLite/Drizzle, pure domain and shared UI/fixtures |
| API entry and protection | `apps/server/src/app.ts:createApp`, `apps/server/src/api/index.ts:createLedgerApi` | Authenticated ledger; CSP/HSTS, origin/session protection, API no-store, request limits and migration write lock |
| Accounts/register | `apps/server/src/api/accounts.ts`, `apps/web/src/ledger/`, `apps/web/src/router.tsx` | Account lifecycle, order, account and all-bookings registers, reconciliation, valuation and linked detail routes |
| Bookings | `apps/server/src/api/bookings.ts`, `packages/domain/src/ledger/` | Capture, split amounts, transfers, filtered history, bulk changes and source/matching identity |
| Envelopes/planning | `apps/web/src/budget/`, `packages/domain/src/ledger/envelope.ts`, `packages/domain/src/ledger/budget.ts` | Monthly assignments/activity/available, move/cover/quick assignment, targets, schedules and year planning; exact formulas are summarized below |
| Audit and reversal | `packages/db/src/repos/audit.ts` | Tracked before/after snapshots, grouped undo/redo and concurrent-change checks; one write group gives one owner undo operation |
| Auth | `apps/server/src/auth/routes.ts`, `apps/server/src/auth/` | Passkeys, recovery, session revocation, sensitive-action fresh step-up and recovery-session restrictions |
| Export | `apps/server/src/api/export.ts`, `docs/export.md` | Existing allowlisted CSV ZIP with fresh-passkey step-up; excludes credentials/auth state, secrets, staging and raw migration data |
| Bank source | `apps/server/src/bank-sync/service.ts`, `apps/server/src/api/bank-sync.ts` | Source identities, matching, deduplication and per-connection policy; SPEC default BOOK posting is pending/uncategorized, PDNG remains a candidate; no automatic envelope allocation |
| Worker | `apps/worker/src/bank-sync-worker.ts`, `apps/server/src/index.ts` | Bank/document job loop plus market/timer scheduling; operational reliability and real authorizations need separate evidence |
| Operator migration | `apps/server/src/imports/`, `docs/migration/` | Staging/dry-run/transactional migration/report/revert paths; legacy HTTP import requires nonproduction plus `BUDGET_IMPORT_HTTP=1` |
| Investments | `packages/domain/src/invest/`, `apps/server/src/api/portfolio*`, `apps/web/src/wealth/` | Securities, quotes, trades, cost basis, holdings, investment cash, classification, returns and savings-plan workflows; source/period/currency coverage matters |
| Offline | `apps/web/src/pwa/queue.ts`, `queue-store.ts`, `pwa.tsx` | Durable booking queue and explicit retry/error behavior; no broad authenticated API-response cache |

Directory references are navigation aids. Feature-level mapping later cites concrete files and named functions/tests; presence in this table does not establish every edge case.

## Navigation and design fit

Actual routing is in `apps/web/src/router.tsx`; page metadata in `apps/web/src/nav/pages.ts`; report definitions in `apps/web/src/nav/reports-catalog.ts`. Main destinations are Heute, Plan, Konten, Vermögen and Reports, with settings below the profile entry. Existing detail URLs carry source/month context; reuse them rather than creating a parallel reference-product navigation.

Reusable UI exports are under `packages/ui/src/components/` and `packages/ui/src/charts/`: amount input, registers, title blocks, parts lists, dimension chains, chart primitives and semantic amount privacy. Application forms reuse the existing shared settings form dialog and workflow-specific forms. DESIGN uses semantic tokens, Archivo/Barlow Semi Condensed, tabular numbers, green available money, red actionable states, quiet historical negative values, and Prussian-blue dark surfaces. Touch targets remain at least 44px; color must not be the only signal.

Specific owner overrides constrain new specifications:

- Plan › Monat: sticky 320px category inspector from 1180px; disclosures below at smaller widths; grouped grid, exact-cent controls and existing write/undo paths.
- Search: command palette on desktop and full-screen phone sheet; `/suche` remains the full results route.
- Other detail information: deep-linkable pages with back/breadcrumb context; input/confirmation dialogs preserve focus and cancellation.
- Vermögen: compact shared-calculation performance summary before actions, proportional signed zero-axis composition and date-spaced daily index; advanced analysis remains in Reports.
- No wholesale adoption of YNAB/Actual/Toolkit/PP branding or independent component library.

## Verification and technical boundaries

The repository defines Vitest domain/API/database/component tests and Playwright synthetic desktop/phone scenarios. `.github/workflows/ci.yml` configures Linux checks, three E2E shards, Windows checks, Docker revision/health smoke and encrypted restore checks. `.github/workflows/deploy.yml` serializes the main-successful-SHA deployment and single-machine SQLite constraint. These checks were inspected, not executed as part of the initial baseline. No current CI pass or live deployment is inferred.

Important limits are distinct: single-machine SQLite write concurrency; date/FX/price completeness; operator-migration ownership; session/step-up restrictions; offline conflict resolution; actual source credentials; physical-device checks; and private financial acceptance. Existing STATUS/FEATURES/REQUIREMENTS-GAPS contain historical placeholder claims, so filenames such as `export-placeholder.tsx` do not by themselves establish a missing feature.

## Data model and financial semantics confirmed in source

- Ledger: `packages/db/src/schema/bookings.ts:85` records signed account-currency cents and original-currency metadata; `:159` records split/transfer identity. `packages/db/src/repos/bookings.ts:408` creates opposite transfer legs and rejects same-account and cross-currency transfers. Split-level transfer IDs permit partial-booking transfers. Cross-currency transfers therefore require an explicit future design; broad currency fields do not prove the workflow exists.
- Envelopes: `packages/domain/src/ledger/envelope.ts:22` computes carry + assigned + signed activity. Positive availability carries forward; negative availability resets unless the category elects overspending rollover. `ledger/budget.ts:45,148,162` owns budget-account boundaries, transfer neutrality, uncategorized money and funded/unfunded credit-card behavior. A transfer crossing the budget boundary consumes or supplies the categorized budget-side leg.
- Holdings: `packages/db/src/schema/invest.ts:200,253,275` connects securities/accounts, trades, 1e-8 signed units, gross amounts, fees/taxes, settlements, snapshots, quotes and currency/day FX. `packages/db/src/repos/trades.ts:442` groups the trade, settlement booking and split atomically; investment income retains its separate income type.
- Returns: `packages/domain/src/invest/returns.ts:18` and `invest/performance.ts:204` implement daily flow-adjusted TTWROR, Modified Dietz and actual/365 XIRR. Flows use `(from,to]`; same-day flows enter the ending value convention. Nonpositive previous values make a TTWROR interval unusable rather than creating a valid percentage.
- Scope is mathematical, not a UI filter: `invest/series.ts:460` uses security-only purchases/deliveries including costs as contributions, sales/deliveries net of costs and distributions as withdrawals. `packages/db/src/repos/portfolio.ts:815` uses external boundary flows for depot-plus-cash; trades/distributions inside that scope remain performance. Comparing these two scopes without adjustment is invalid.
- Basis: `invest/cost.ts:37` supports average and FIFO, buy costs include fees/taxes and net sale proceeds deduct them. `packages/db/src/repos/portfolio-summary-realized.test.ts:109` preserves documented realized gains through snapshots, including zero units. Unknown history is not an invented zero basis.
- Valuation: `invest/series.ts:130,218,396` takes the latest usable quote on/before valuation day, flags quotes older than seven days, and can use gross trade-price fallback before/after the day while rejecting an intervening split. Default fallback may estimate from average basis; strict missing-value policies differ. `series.ts:183` converts quote value at valuation-day EUR-per-unit FX with cent rounding per position/day; trade costs use trade-day FX. `portfolio-summary.ts:265` converts snapshot basis at snapshot-day FX. Missing FX, missing price and unknown basis remain separate states; `portfolio.ts:389,472` distinguishes strict errors from nullable wealth totals.
- Migrations: `packages/db/drizzle/0000*` through `0043_expected_interval_weeks.sql`; 0003 is the last broad rebuild, later changes are additive. Persisted cost method (0011), dated exposures (0031), allocation membership (0033), dated targets (0035), class groups (0038) and schedule interval weeks (0043) must be reused.

## Concrete inconsistencies and acceptance gaps

| Finding | Evidence | Research consequence |
| --- | --- | --- |
| Cost module comment calls FIFO default, actual preference/SPEC default average | `packages/domain/src/invest/cost.ts:5`, `packages/db/src/schema/system.ts:33`, SPEC §10 | Use actual persisted preference and default; record the comment defect, do not silently change product code |
| Actual report registry has 34 entries (11+6+6+5+6), older prose says 25/30/31 | `apps/web/src/nav/reports-catalog.ts:39,262`, `nav/pages.ts:257`, `DESIGN.md` Reports section | Inventory the actual 34 and their dispatch in `pages/reports-pages.tsx`; never treat an obsolete count as missing reports |
| Strict stored-quote language remains below newer fallback directive | SPEC leading allocation/valuation override versus §10; `invest/series.ts` | Specifications expose valuation policy and quality; strict parity fixtures must name fallback and stale handling |
| Old panel/no-panel, navigation-index and portfolio-description text conflicts | Leading SPEC/DESIGN directives; `shell/sidebar.tsx`, `router.tsx` | Preserve current narrow exceptions and current routed source; no redesign by obsolete prose |
| Private reconciliation is open | `docs/REQUIREMENTS-GAPS.md:D02–D05`, `docs/STATUS.md` gates | No personal file access in this public research; separate synthetic correctness from future private acceptance |

## Existing validation anchors

Present, not run in P1: `packages/domain/src/invest/returns.test.ts:5`, `invest/performance.test.ts:42`, `packages/db/src/repos/portfolio-series.test.ts:96`, `packages/domain/src/ledger/budget.test.ts:386`, API auth/bank/export/import/audit tests and database migration tests. Examples include literal deposits/withdrawals, dividends/sales, FX/missing FX, basis/realized gains, budget/card boundaries and transfer neutrality.

Existing UI states are concrete: `apps/web/src/ledger/states.tsx` has polite loading, alert/retry and explanatory empty-state components; recurring-payment views expose no-upcoming/no-payment creation states; missing goal/payment details are explicit. Extend these patterns in specifications.

## P1 coverage gate

Closed on 2026-10-15 after three independent scoped read-only agent inventories and lead integration. Covered: product/precedence, actual architecture, model/migrations, money/returns/FX rules, APIs/sync/export/auth/audit, navigation/design/reuse, tests and limits. Not performed: production access, private financial acceptance, executing the product test suite, screenshot/prototype fidelity or a full code security audit. Those limits do not block public reference research. Next phase: YNAB only.
