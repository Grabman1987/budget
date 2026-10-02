# Budget feature coverage: YNAB and Portfolio Performance replacement

Reviewed: 2026-10-01 against merged source `665b52e` (PRs #71–#90),
plus reviewed manual-price source `05c1ed9` (PR #91; integration tracked in TASKS).
This is the central coverage inventory for the **agreed Budget V1 scope**. It joins
requirements, existing mockups, usable application features and remaining work.
It is not a version-specific exhaustive inventory of the upstream products, or a
claim that every feature of YNAB or Portfolio Performance will be copied.

Source precedence remains [SPEC](../SPEC.md) → [PRODUCT](../PRODUCT.md) →
[DESIGN](../DESIGN.md) → [prototype](../design/prototype/) →
[original concept](concept/produktkonzept.md). This inventory adds no product scope.
[ROADMAP](ROADMAP.md) holds acceptance checklists; [TASKS](TASKS.md) tracks delivery.
The prototype uses synthetic data. A clickable mockup is not a connected app page.

## How to read the status

- **UI + engine:** an application workflow and its supporting code exist; private
  source reconciliation, owner design acceptance and operational gates may remain.
- **Engine/API:** tested calculation, storage or endpoint exists; the complete
  user workflow is not delivered.
- **Partial:** only some parts of the listed feature are implemented.
- **Placeholder:** route/navigation exists, without the actual feature body.
- **Open:** implementation or the stated acceptance is still missing.

These statuses describe source implementation, not the deployed image. Production
acceptance requires a matching `/health` revision and successful deployment steps.
No percentage is inferred by counting pages, commits or tests.

## Budget and daily work: replacing the agreed YNAB workflows

Prototype references: [Heute](../design/prototype/index.html),
[Plan](../design/prototype/plan.html), [Konten](../design/prototype/konten.html),
[Einstellungen](../design/prototype/einstellungen.html).

| ID | Function / owner-facing label | Status | What remains for completion |
| --- | --- | --- | --- |
| Y01 | Account overview, budget/tracking/investment/debt roles, closed balances | UI + engine | Private balances; foreign-currency detail acceptance remains separate |
| Y02 | Account register, filters, sorting, booking details and running balances | UI + engine | Full native/EUR currency labelling across tables, charts and reconciliation |
| Y03 | Income, expenses, arithmetic amount input, payees, categories and notes | UI + engine | Owner phone/desktop usability acceptance with migrated data |
| Y04 | Split bookings, account transfers and bulk actions | UI + engine | Private reconciliation; trade/currency invariants have regression coverage |
| Y05 | Kontostand prüfen and confirmed bookings | UI + engine | Real account comparison; no fabricated reconciliation adjustments |
| Y06 | Categories/groups, Bedarf/Wunsch/Zukunft, targets and ordering | UI + engine | Owner-approved target categories and migration mapping |
| Y07 | Zu verteilen, Zugewiesen, Aktivität, Verfügbar and rollover | UI + engine | Gate 2: cent-exact account/month/category comparison with mapped source |
| Y08 | Credit-card payment categories and cash advances | Engine/API + budget integration | Real card mapping and payment-balance acceptance in Gate 2 |
| Y09 | Month planning: waterfall, time, groups, classes and triage | UI + engine | Owner acceptance; preserve nine-stage order and shared calculations |
| Y10 | Cover overspending, distribute money and preview next allocations | UI + engine | Real payday/month-end routine acceptance; later inspiration features are separate |
| Y11 | Expected payments: versions, due dates, contracts, matching, missed payments | UI + engine | Live incoming bank bookings and private schedule acceptance |
| Y12 | Savings goals and sinking funds, adopt category targets | UI + engine | Private targets and end-to-end goal review |
| Y13 | Heute: free until payday, pace, low point, upcoming payments, next steps | UI + engine | Functional desktop/mobile checks passed, including capture/undo/redo and source navigation; owner visual/device acceptance remains open |
| Y14 | Plan › Jahr, planned events and scenario workflow | Partial; UI placeholder | Connect forecasting/event storage and build the annual planning workflow |
| Y15 | Contacts, receivables, repayments and contact statements | EUR ledger/API + connected UI | Actual statement, retained balanced history, editable oldest-first allocation, explicit credit, atomic audit/undo and dependency guards implemented; foreign-currency statements, broader contact editing and owner workflow/design acceptance remain open. Derived balances do not enter net worth |
| Y16 | Posteingang: categorize, accept/reject suggestions, resolve exceptions | Working basics: actual queue/count, categorize/confirm, warning acknowledgement with undo | Bank/assignment suggestion accept/reject flows and owner workflow acceptance remain open |
| Y17 | Global search (Ctrl K) | UI + engine | Session-protected, bounded booking/payee/category/account/contact search; keyboard/touch navigation. Owner acceptance pending |
| Y18 | Assignment rules / Immer so zuordnen | Partial; UI placeholder | Rule editor, safe automatic application and inbox decision integration |
| Y19 | Bank connection, consent renewal and reconciliation | Open | Adapter, authorized connection workflow, deduplication, error handling and private bank acceptance |
| Y20 | Nightly bank/source worker with catch-up | Partial | Market timer exists; full worker and 14-day stable nightly acceptance do not |
| Y21 | Receipt photograph/upload and links to bookings | Open | Object storage, safe upload, booking linkage and mobile capture |
| Y22 | Payslip lines, projects and side income | Partial | Project attribution on bookings exists; project management/P&L, payslip capture and reports remain open |
| Y23 | R01–R16, stages and Finanz-Check | UI + engine | Owner confirmations and actual-data rule acceptance; history report remains open |
| Y24 | Weekly inbox, payday distribution, month/year/quarter closing routines | Partial | Guided complete routines, completion states and resulting reports |
| Y25 | Mobile capture, accessible layout, dark mode | UI + engine for built pages | Repeat matching mockup/visual/accessibility checks for every new page |
| Y26 | Installable PWA and offline booking queue | Open | Web manifest/installability, service worker, offline persistence, synchronization, conflicts and device acceptance |

First private migration is EUR-only from 01.10.2023. Unsupported foreign-currency
budget accounts are guarded; full foreign-currency support remains later scope.

## Investments and wealth: replacing the agreed Portfolio Performance workflows

Prototype references: [Vermögen](../design/prototype/vermoegen.html),
[portfolio report calculations](../design/prototype/reports-portfolio.js),
[shared cost/gain logic](../design/prototype/reports-core.js).

| ID | Function / owner-facing label | Status | What remains for completion |
| --- | --- | --- | --- |
| I01 | Securities, cash/reference accounts, depots and asset classes | Partial UI + engine | Basic instrument metadata creation/editing is connected; extended source/cost settings, investment management workflows and privately mapped instruments/accounts remain |
| I02 | Buy/sell, deliveries, splits, dividends, interest, fees and taxes | Engine/API | User capture/edit workflow, complete source histories and private statement comparison |
| I03 | Trade linked atomically to its settlement booking | Engine/API | Private reconciliation; protected generic edit/delete/undo paths are implemented |
| I04 | Historical holdings and daily valuations | Partial UI + engine | Current positions and instrument detail are connected; historical product views and comparison against actual PP data remain |
| I05 | Historical acquisition costs and booking-date FX | Engine/API | Full source history; explicit resolution of missing rates/basis in Gate 3 |
| I06 | Moving-average default and optional FIFO | UI + engine | Private analytical comparison; persisted setting is in Einstellungen › Depots & Kryptos |
| I07 | Realized/unrealized gains, including fully sold positions and later snapshots | Engine/API | Display and private reference reconciliation; unknown historical basis stays unknown |
| I08 | Broker acquisition amounts, execution amounts, fees and withheld taxes | Partial | Retain and reconcile actual source values; no second withholding calculation or tax booking |
| I09 | One security at multiple brokers; depot/platform/class aggregation | Partial UI + engine | Current positions retain per-broker ownership; complete depot workflows and privately verified account/institution mapping remain |
| I10 | Price histories, source per price, primary/fallback adapters | Engine/API | Actual identifiers, price conventions, authorized live-source validation and source settings UI |
| I11 | Manual prices/valuations and undo | Partial UI + engine | Instrument detail supports audited manual quotes and undo; other wealth capture UI remains open; automatic refresh protection stays |
| I12 | Correct price freshness, initial refresh time and stale-source warnings | Partial | Explicit successful first-refresh timestamp and accepted live/source-status workflow |
| I13 | ECB FX and original-currency amounts | Engine/API | End-to-end currency detail acceptance and complete private historical rates |
| I14 | TTWROR, XIRR, Modified Dietz and external flows | Engine/API | Period/product/depot report UI; private PP equality with identical periods and conventions |
| I15 | Volatility, drawdown, Sharpe, beta, benchmarks and monthly returns | Engine/API | Benchmark data, charts, filters and private reference comparison |
| I16 | Allocation Soll/Ist, region/product structure and rebalancing | Partial UI + engine | Current class Soll/Ist, R13/R14/R15 hints and audited target versions are connected; region/product reports, savings-plan actions and accepted private rebalancing workflows remain |
| I17 | Savings plans, execution matching and change proposals | Schedule UI + engine/API | Native-currency schedule create/edit/end, current/future versions and audited undo are available. Execution/proposal UI and private acceptance remain; bank action stays manual and proposals do not execute orders |
| I18 | Net worth, own contribution vs market, daily history and composition | UI + engine | Private reconciliation, first-refresh freshness and owner design acceptance |
| I19 | Debt repayment / Sondertilgung | Connected current debts, real history and unpersisted native monthly payoff model | Persisted per-loan terms/workflow, variable conditions and private contractual scenario acceptance |
| I20 | Freiheitszahl with Soll-Pfad and target year | Partial UI + shared calculation | Current R16 sources and explicit unsaved saving forecast are connected; historical Soll path, chosen goal year, saved assumptions and private acceptance remain open |
| I21 | PP XML parsing, security matching, reversible transfer and Gate 3 report | Partial | Parser/target plan exist; persisted commit, matching and independent Gate 3 acceptance remain |

Held instruments without quotes retain known basis and explicit unknown market value/gain
in accounts, positions and CSV. Numeric history rejects an unpriced held day; a first quote
does not invent historical market gain. Today isolates unavailable valuation sections while
keeping daily budget work usable. Partial-history charts and partial legacy summary fields
remain open; financial/private acceptance is unchanged.

The app's gains are analytical figures. Broker withholding is source data.
Average/FIFO selection does not rewrite source trades, and no tax-filing parity
has been accepted. Corporate actions, transfer basis and unknown history require
explicit migration findings; parser support is not proof of lossless private transfer.

## All 30 agreed reports

The [report catalog](../apps/web/src/nav/reports-catalog.ts) and navigation are
implemented. The current [ReportPage](../apps/web/src/pages/reports-pages.tsx)
dispatches connected bodies where implemented and otherwise renders a placeholder,
as recorded below. Existing domain calculations,
related working pages and prototype charts do not make these reports finished.
Each needs connected data, period controls, the specified chart, booking drill-down,
consistent totals, desktop/mobile checks and printing where required.

| ID | Report | Prototype calculation/view reference | Remaining status |
| --- | --- | --- | --- |
| 1.1 | Monats-One-Pager | `reports-monat.js` | Body + A4 print Open |
| 1.2 | Gehaltsreport | `reports-monat.js` | Payslip capture, body and yearly comparison Open |
| 1.3 | Einnahmen | `reports-monat.js` | Body Open |
| 1.4 | Geldfluss | `reports-monat.js` | Connected Sankey body Open |
| 1.5 | Jahresansicht | `reports-monat.js` | Body + previous year Open |
| 1.6 | Kategorieübersicht | `reports-monat.js` | Body Open |
| 1.7 | Sparquote und Geldalter | `reports-monat.js` | Body Open |
| 1.8 | Gesamttabelle | `reports-monat.js` | Body Open; account/depot CSV ZIP export is implemented separately |
| 1.9 | Projekte und Nebeneinkünfte | `reports-monat.js` | Capture/data + body Open |
| 2.1 | Ausgabenanalyse | `reports-ausgaben.js` | Body Open |
| 2.2 | Budgettreue inkl. 50/30/20 | `reports-ausgaben.js` | Body Open; twelfths rule follows SPEC |
| 2.3 | Verträge und Abos | `reports-ausgaben.js` | Report body Open; expected-payment workflow exists |
| 2.4 | Persönliche Inflation | `reports-ausgaben.js` | Body Open |
| 2.5 | Empfänger-Analyse | `reports-ausgaben.js` | Body Open |
| 2.6 | Bank- und Zinskosten | `reports-ausgaben.js` | Body Open |
| 3.1 | Liquiditätsprognose | `reports-zukunft.js` | Body + events/levers Open; forecast engine exists |
| 3.2 | Cashflow-Verlauf | `reports-zukunft.js` | Body Open |
| 3.3 | Vermögensverläufe | `reports-zukunft.js` | Report body Open; net-worth page exists |
| 3.4 | Jahresvorschau Zahlungen | `reports-zukunft.js` | Partial: connected twelve-month versioned expected-outflow contract preview, native ranges/currencies, stored status/link overlay; independent savings plans, other future transfers and full source dedup remain Open |
| 3.5 | Sparziele-Fortschritt | `reports-zukunft.js` | Partial: connected stored monthly goals, unique live EUR sources, API progress/rates/forecast and source drilldowns; emergency reach, Tagesgeld allocation, shared-source funding and linear Soll remain Open |
| 4.1 | Depots im Vergleich | `reports-portfolio.js` | Body Open |
| 4.2 | Allocation | `reports-portfolio.js` | Body Open |
| 4.3 | Einzahlungen und Wert | `reports-portfolio.js` | Partial: securities-only period chain, monthly value/flow series and conserved calendar-year rows; no depot cash or savings-plan/R12 attribution |
| 4.4 | Rendite und Kennzahlen | `reports-portfolio.js` | Partial: connected securities-only period metrics and lifetime documented realized gain; benchmark comparison, asset-class comparison and monthly heatmap remain open |
| 4.5 | Kosten, Steuern, Erträge | `reports-portfolio.js` | Body Open; show source taxes without duplicate withholding |
| 5.1 | Jahresreport | `reports-ueberblick.js` | Body + two printable sheets Open |
| 5.2 | Finanz-Check-Verlauf | `reports-ueberblick.js` | History body Open; current rule status exists |
| 5.3 | Explorer | `reports-ueberblick.js` | Pivot, saved views and body Open |
| 5.4 | Kontakte-Abrechnung | `reports-ueberblick.js` | Fixed all-time EUR report: shared receivable/credit chain, per-person retained ledger, running balance stair chart and source drilldown. Pending bookings explicitly included; mixed currency unavailable. Owner/private acceptance remains |
| 5.5 | Zeitraumvergleich | `reports-ueberblick.js` | Body Open |

References are under [design/prototype](../design/prototype/). The older concept's
report list is superseded by these 30 reports in SPEC §7.

## KPIs, settings and cross-cutting acceptance

The [27-KPI catalog](concept/produktkonzept.md#8-kpi-katalog) specifies every KPI's
formula, target and primary place. SPEC §6 and prototype rules override older
formulas, including assigned-money 50/30/20 with periodic costs as twelfths.
KPI presence in a pure helper or API is not acceptance of its complete display,
drill-down or report; the relevant Y/I/report row above stays open until connected.

| Function | Status | Remaining completion evidence |
| --- | --- | --- |
| Accounts/categories/rules and investment cost-method settings | UI + engine | Owner data and device acceptance |
| Sources, assignment rules and asset-class management settings | Partial / placeholders | Complete editors and connected operational status |
| Passkeys, sessions, recovery and security settings | UI + engine | Owner phone/desktop login, recovery and actual encrypted restore |
| Audit log and undo | Implemented infrastructure | Verify every newly added user mutation; manual-price API is tested; complete capture UI remains tracked above |
| Encrypted backup, restore and deployment infrastructure | Implemented, CI checks | Real owner restore; independent second backup destination remains open |
| Shared calculations, integer money and explainable totals | Implemented foundation | Every new view uses shared figures and passes independent financial regression cases |
| Visual prototype fidelity and accessibility | Partial acceptance | Remaining primitives + every new page at desktop 1440/mobile 390, light/dark, touch targets, reduced motion |
| Separate private YNAB/PP migration | Open acceptance | Authorized private files, backup, mapping, persisted reconciliation and owner review |
| CSV export of all accounts/depots | ZIP download with fresh passkey step-up; account, ledger, trade, holding, price, valuation, security, class, target, FX-rate and savings-plan CSVs ([format](export.md)) | Synthetic archive/auth coverage; owner data acceptance remains |
| App import upload/wizard | Excluded by owner | Do not recreate; one-time transfer is a separate private task |

## Path from mockups to a complete replacement

1. **Operational readiness:** verified live source revision, passkeys/recovery and
   a real encrypted restore. Gate 1 requires owner approval of spec/design/prototype.
2. **Budget acceptance:** private EUR migration with approved mapping; every
   account/month/category reconciles to the cent (Gate 2).
3. **Daily workflows:** Heute, contacts, inbox/search and annual planning; connect
   the existing calculations to the agreed mockups and guided routines.
4. **Reliable sources:** bank connections, assignment rules and nightly catch-up;
   actual price/source validation and 14 stable days of the full nightly workflow.
5. **Investment acceptance:** complete portfolio/decision/debt/freedom UI, PP
   commit/matching and independent holdings/returns reconciliation (Gate 3).
6. **Reports and device completion:** all 30 report bodies, explorer/print,
   PWA/offline synchronization and full prototype/device acceptance.
7. **Cut-over:** a complete month-end in parallel without differences (Gate 4).
   Only then retire YNAB and Portfolio Performance.

Independent code tasks can proceed while private acceptance inputs are pending.
The owner's remaining inputs are private export access and mapping decisions,
source identifiers/conventions, device/recovery/restore checks and gate sign-offs.
No new layout, bank credentials or financial assumptions should be guessed.
