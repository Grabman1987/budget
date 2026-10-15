# Actual Budget

Research closed 2026-10-15. Official entry: [Actual](https://actualbudget.org/), [source](https://github.com/actualbudget/actual), pinned commit `d5d6035a8f5867717a80635d270fbe64e370ea08`. Client/core/API/sync-server manifests identify 26.10.0; the root package's 0.0.1 is workspace metadata. Live documentation may move independently. [Inventory](inventories/actual.csv): 93 feature records, ACT-001–035, ACT-041–075 and ACT-081–103; gaps reserve assignment ranges and do not imply missing records.

## Purpose, navigation and workflows

Actual is a local-first personal finance application with envelope and tracking budget modes. Its primary workflow is account/register capture, categorization, cash allocation and financial review. Accounts can be on or off budget; negative-balance credit cards use ordinary account mechanics. This differs from YNAB's automatic card-payment envelope. Do not transplant both mechanisms into Budget.

Desktop navigation exposes budget, accounts, schedules, rules and reports; settings include display, sidebar ordering/start page, backup, sync and optional encryption. Sidebar preferences are budget-level but not uniformly honored by mobile. Report dashboards provide separate saved analytical workspaces. This is useful behavior evidence, not a proposal to replace Budget's Heute/Plan/Konten/Vermögen/Reports navigation.

The owned temporary public-demo browser reached the 26.10.0 welcome screen, including Start budgeting, Try the demo, Connect sync and Import budget controls. Clicking Try the demo in that disposable profile reached “Making demo…” within the capture window. No loaded budget, financial formula, import or report was observed. REA evidence IDs: `ev_753a10ba782fc4c8eb678660a756bc9bfb606d955c0c593dbc49a8dcc0306305` (welcome), `ev_4a40c342f793ed2d18af5c525709f2925d2d6a341f6a6928fd1d40628cc01a64` (demo preparation). Both sessions were cleaned up. Timing does not establish a product failure. These captures do not upgrade source-backed rows to runtime verification.

## Model and business rules

The client works against a local database; the optional separate server synchronizes changes and mediates bank providers. Core models include accounts, contacts/payees, category groups/categories, transactions, linked transfer legs, parent/split children, rules, schedules and monthly budget rows. Tombstones and synchronization state matter for recovery. See [core calculation and schema audit](actual-calculations.md) and [ledger/integration audit](actual-integrations.md) for pinned symbols and existing tests.

Envelope category availability is `assignment + signed activity + prior carry`, where positive prior balances always carry; negative balances carry only if enabled. Otherwise prior overspending reduces next month's To Budget. Synthetic case: a −25.00 category with rollover disabled starts next month at zero carry and reduces available funding by 25.00; enabling rollover carries −25.00 within the category instead. Applying both would double count the deficit. Tracking mode uses a different plan-versus-actual engine; it is not an interchangeable display of envelope availability.

Held income and manual month-ahead buffering are separate source inputs. Funds held for the next month do not become spendable twice. Moving assignments does not create transaction activity. Covering overspending caps funding at the source's positive balance. An explicit numeric-zero argument follows an omitted-amount path in one reviewed action; reference behavior should not become a desired Budget validation rule.

Splits preserve parent/child sums; internal transfers create equal opposite legs. On/off-budget boundary transfers have category consequences on the budget side. Reconciliation compares a target to cleared balances, then locks only at zero difference. Import matching is account scoped: source IDs first, then amount/date/payee matching within a bounded date window. Raw add-transactions and import-transactions APIs have different deduplication behavior. Re-importing deleted rows has API-versus-UI defaults that must remain explicit.

## Planning and automation

Template types include fixed, periodic, refill, copy, average, percentage, date-bound saving/spending, schedule, remainder, limit and goal forms. Priority and available-money clamps affect application; dry-run displays total demand without the funding clamp. Existing nonzero assignments normally remain unless forced. These are candidates for a preview-and-apply workflow, not permission to silently rebudget.

Schedules expand recurrence and feed rules/transaction generation; templates can use schedule identity and projected category impact. Rule actions, splits and balance formulas interact. Date limits, completed schedules, rounding and residual distribution need synthetic tests; merely reproducing option names is insufficient.

## Integrations, privacy and recovery

File parsers support CSV/TSV, QIF, OFX/QFX and CAMT XML, with field/format options. CSV output protects spreadsheet formula prefixes. Actual's local Node API and ActualQL are not a general REST service. ActualQL exposes filtered/projected/grouped/aggregated queries with important split semantics and partially documented edges.

Bank providers in the pinned source include SimpleFIN, GoCardless, Pluggy, Akahu and Enable Banking, with availability, consent and experimental restrictions. Provider access is not implied by source presence. Pinned source/documents support optional automatic refresh while the application is open, off by default, with a minimum custom interval of 15 minutes. Some live documentation still describes manual-only refresh. Treat this as documentation/release drift, not a universal manual-only rule; source paths and limits are in the integration audit.

Optional E2EE protects remote budget data. It does not encrypt the local database or the separately stored provider credentials. This is a boundary of the documented scheme, not a security certification. Lost encryption credentials without a usable local copy can be unrecoverable. Sync reset selects an authoritative local copy and changes sync identity; other devices may lose unsynchronized changes. Backup/restore and desktop auto-backup are separate from sync. The reviewed retention implementation and documentation differ in phrasing; do not promise a retention policy without naming the version. Budget must retain its own encrypted backup, restore drill and migration gates.

## Reports, currencies and investments

Configurable dashboards contain built-in and saved custom reports. Tables, bar/line/area/donut charts have different valid combinations of net, payment, deposit and grouping options. Date ranges may be static or live; account splitting is transaction aggregation, not historical account balances. Saved edits can update, fork, revert or be discarded. [Report/settings review](actual-source-review.md) records these distinctions.

Budget Analysis, Balance Forecast, Sankey and Monte Carlo are experimental in reviewed documentation. They are not verified forecasts or confidence statements. Net worth includes account balances and selected off-budget investment accounts; crossover analysis does not establish security holdings, cost basis, market quotes or security-level return accounting.

There is no native multi-currency calculation in the reviewed product documentation. Currency formatting is independent. The experimental rule workaround uses manual fixed-rate conversion and notes; it does not preserve a complete multi-currency ledger or produce consolidated historical FX valuation. Budget's account originals, date-specific EUR valuation and missing-FX states should remain the foundation.

## License and source use

The [root license](licenses/actual-root-MIT.txt) is MIT; several package manifests also declare MIT. `packages/loot-core/package.json` declares ISC. Record the package/file provenance before any code reuse; the repository must not be labeled uniformly MIT. Retain applicable copyright and license notices, and inspect third-party inclusions. This research copies no implementation. Concepts may be implemented independently against Budget's existing domain model; no upstream dependencies were installed or tests executed.

## Coverage gate

Closed after three scoped source reviews and lead integration. Covered: both budget modes, carry/holds/cards/refunds, templates/goals/schedules/rules, account/register/splits/transfers/reconcile, parser/matching/export/API, synchronization/E2EE/providers/backups, reports/AQL/settings/mobile boundaries, currencies/investment scope, schema/migrations and relevant existing tests. Every inventory record has a primary source, locator, retrieval date, version, evidence and uncertainty.

Not covered by execution: a loaded demo budget, provider credentials, server deployment, encrypted cross-device recovery, experimental reports and the full upstream test suite. The inventory is a bounded functional study, not an enumeration of every menu item or proof of parity. These gaps are explicit and do not require private data. Next product: Portfolio Performance only after this closure.
