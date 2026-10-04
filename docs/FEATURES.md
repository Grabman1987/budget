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

Planning/report improvement (2026-10-03): Plan › Monat compares live expected household
income with the existing envelope monthly target requirements, including stored monthly
holds, and opens unfunded categories. Without due schedules it labels the median of three
complete earned-income months; incomplete schedules/history remain unavailable. The current
payday rule has no configured salary amount, so it does not fabricate an amount-rule source.

All implemented selectable-period reports (categories, savings, spending, recipients,
cashflow, wealth history, depot comparison, contributions, returns and Explorer) share
calendar-month quick selection and custom inclusive month ranges. Existing short period
URLs and controls retain their semantics; current-month facts stop at today. Actual
time-series charts offer an optional descriptive linear trend, off by default and retained
in the URL. Month/year-only, fixed-source and forecast reports retain their scoped controls.
No migration; owner acceptance and pinned Linux CI remain separate from local checks.
See [delivery evidence and changed files](evidence/income-targets-report-ranges.md).
UX quick wins (2026-10-03): device privacy mode with header/settings/keyboard controls,
one authenticated storage-persistence request and settings status, explanatory monthly
uncategorized/pending cash row, populated split-line remainder distribution, Today
attention links and validated owner-saved capture URLs are implemented. The category
picker's available-money column and negative warning ink already existed and were
retained. See [capture links and device conveniences](capture-links.md) for semantics,
synthetic URL examples and device owner steps. Browser/device acceptance and delivery
evidence are tracked in the [review evidence](screenshots/ux-quick-wins/README.md);
no database migration is needed.

Prototype references: [Heute](../design/prototype/index.html),
[Plan](../design/prototype/plan.html), [Konten](../design/prototype/konten.html),
[Einstellungen](../design/prototype/einstellungen.html).

| ID | Function / owner-facing label | Status | What remains for completion |
| --- | --- | --- | --- |
| Y01 | Account overview, budget/tracking/investment/debt roles, closed balances | UI + engine | Private balances; foreign-currency detail acceptance remains separate |
| Y02 | Account register, filters, sorting, booking details and running balances | UI + engine | Full native/EUR currency labelling across tables, charts and reconciliation |
| Y03 | Income, expenses, arithmetic amount input, payees, categories and notes | UI + engine | Owner phone/desktop usability acceptance with migrated data |
| Y04 | Split bookings, account transfers and bulk actions | UI + engine | Private reconciliation; trade/currency invariants have regression coverage |
| Y05 | Kontostand prüfen and confirmed bookings | UI + engine + bank observation | Bank balance/date/fetch stamp and reconciled-through date; matching current balances can lock through today with audit/undo. Real account acceptance remains open |
| Y06 | Categories/groups, Bedarf/Wunsch/Zukunft, targets and ordering | UI + engine | Owner-approved target categories and migration mapping |
| Y07 | Zu verteilen, Zugewiesen, Aktivität, Verfügbar and rollover | UI + engine | Gate 2: cent-exact account/month/category comparison with mapped source |
| Y08 | Credit-card payment categories and cash advances | Engine/API + budget integration | Real card mapping and payment-balance acceptance in Gate 2 |
| Y09 | Month planning: waterfall, time, groups, classes and triage | UI + engine | Owner acceptance; preserve nine-stage order and shared calculations |
| Y10 | Cover overspending, distribute money and preview next allocations | UI + engine | Real payday/month-end routine acceptance; later inspiration features are separate |
| Y11 | Expected payments: versions, due dates, contracts, matching, missed payments | UI + engine | Live incoming bank bookings and private schedule acceptance |
| Y12 | Savings goals and sinking funds, adopt category targets | UI + engine | Private targets and end-to-end goal review |
| Y13 | Heute: free until payday, pace, low point, upcoming payments, next steps | UI + engine | Functional desktop/mobile checks passed, including capture/undo/redo and source navigation; owner visual/device acceptance remains open |
| Y14 | Plan › Jahr, planned events and scenario workflow | UI + engine; owner acceptance pending | Twelve envelope reads plus category/month event grid; audited create/edit/switch-off/remove and undo/redo; once/monthly/quarterly/yearly/specific-month rules shared with liquidity report 3.1. Unsaved selected-event scenarios overlay future event deltas on stored Zu verteilen, with monthly and December comparison. No bookings, assignments or extra income extrapolation; owner visual/device acceptance remains open |
| Y15 | Contacts, receivables, repayments and contact statements | EUR ledger/API + connected UI | Actual statement, retained balanced history, editable oldest-first allocation, explicit credit, atomic audit/undo and dependency guards implemented; foreign-currency statements, broader contact editing and owner workflow/design acceptance remain open. Derived balances do not enter net worth |
| Y16 | Posteingang: categorize, accept/reject suggestions, resolve exceptions | Queue/count, categorize/confirm, bank merge/transfer decisions and acknowledgement with undo | Assignment-rule decisions and owner workflow acceptance remain open |
| Y17 | Global search (Ctrl K) | UI + engine | Session-protected, bounded booking/payee/category/account/contact search; keyboard/touch navigation. Owner acceptance pending |
| Y18 | Assignment rules / Immer so zuordnen | Partial UI + engine | Income budget-month defaults per payee/category/type implemented (decision 42); broader categorization rules and inbox automation remain open |
| Y19 | Bank connection, consent renewal and reconciliation | UI + engine + matching | Decision 41: BOOK immediately becomes an unchecked, uncategorized booking; PDNG stays a confirmation candidate. Per-source override, dedupe/audit and balance checks implemented. Owner-confirmed manual merge and mirror/selected-pair transfer linking (+/-5 days) for candidates and unchecked bank bookings, dated balance/reconciliation lock, audit/undo. Private bank acceptance remains |
| Y20 | Nightly bank/source worker with catch-up | Partial | Market timer exists; full worker and 14-day stable nightly acceptance do not |
| Y21 | Receipt photograph/upload and links to bookings | Implemented; owner acceptance open | Volume blobs, bounded authenticated upload, booking links/undo, inbox capture, previews/download and encrypted archive backup; metadata limits and real-phone/restore acceptance: [receipts](receipts.md) |
| Y22 | Payslip lines, projects and side income | Connected slice | Manual audited/undoable EUR payslip capture and linked payouts; project create/rename/archive, active booking attribution and split-based P&L. Raise metadata and hourly rates remain open; payslip receipt attachment uses the receipts store |
| Y23 | registered rules (`RULE_CODES`), stages and Finanz-Check | UI + engine | Book-derived checks, private inputs, configurable thresholds, disabled defaults; history derives twelve month ends plus today |
| Y24 | Weekly inbox, payday distribution, month/year/quarter closing routines | Partial | Guided complete routines, completion states and resulting reports |
| Y25 | Mobile capture, accessible layout, dark mode | UI + engine for built pages | Repeat matching mockup/visual/accessibility checks for every new page |
| Y26 | Installable PWA and offline booking queue | Implemented; device acceptance open | Static-only shell plus IndexedDB booking capture/edit/delete, FIFO retry on online/focus/manual send, durable API idempotency and retained conflict/session reasons. No API response caching; physical phone acceptance remains open. See [PWA contract](pwa.md) |

First private migration is EUR-only from 01.10.2023. Unsupported foreign-currency
budget accounts are guarded; full foreign-currency support remains later scope.

Owner decision 42: capture/edit offers **Für nächsten Monat** per inflow. Category
and income type stay intact; account balances and cash-flow/income reports keep the
actual date, while Zu verteilen and budget allocation use the following month.
Defaults in Einstellungen › Zuordnungsregeln affect new owner captures only and can
be overridden per booking. Transfers, contact repayments and mixed spending cannot
be deferred. Rules/month changes are audited and undoable; private month-end acceptance remains.

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
| I15 | Volatility, drawdown, Sharpe, beta, benchmarks and monthly returns | Connected securities report | Owner-selected stored-price benchmark, class comparison and monthly heatmap; depot-inclusive view and private reference comparison remain open |
| I16 | Allocation Soll/Ist, region/product structure and rebalancing | Partial UI + engine | Current class Soll/Ist, R13/R14/R15 hints and audited target versions are connected; region/product reports, savings-plan actions and accepted private rebalancing workflows remain |
| I17 | Savings plans, execution matching and change proposals | Schedule UI + engine/API | Native-currency schedule create/edit/end, current/future versions and audited undo are available. Execution/proposal UI and private acceptance remain; bank action stays manual and proposals do not execute orders |
| I18 | Net worth, own contribution vs market, daily history and composition | UI + engine | Private reconciliation, first-refresh freshness and owner design acceptance |
| I19 | Debt repayment / Sondertilgung | Connected current debts, real history and unpersisted native monthly payoff model | Loan terms (rate, fixed/variable, installment, term, original amount) are stored in Einstellungen › Konten and read by the calculator and the cost report; variable-rate changes over time and private contractual scenario acceptance remain |
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
| 1.1 | Monats-One-Pager | `reports-monat.js` | Connected: month selector, drawing sheet A–G (result chain, 50/30/20 on assigned money, net worth with own/market, largest spending, plan, Finanz-Check cells, pace chart, revisions) from the shared ledger facts; Kapitalerträge only as a note (not in Einnahmen/Sparquote); no rate for a running month; valuation gaps shown honestly; A4 print stylesheet (one page, app chrome hidden, light tokens). Owner/private acceptance remains |
| 1.2 | Gehaltsreport | `reports-monat.js` | Connected manual capture, monthly gross/net and ratios, calendar years/same-month comparison, fourteen recorded salaries and linked-booking warnings. PDF storage, collective/step raises and inflation comparison remain open |
| 1.3 | Einnahmen | `reports-monat.js` | Connected: month selector, 12-month stacked income by type, expected against received (match status; schedule fallback `nicht zugeordnet` while occurrences are unmaterialised), Kapitalerträge separate (not household income), refunds/transfers/contact repayments excluded. Owner/private acceptance remains |
| 1.4 | Geldfluss | `reports-monat.js` | Connected: month or 12 months (to the last full month), Sankey income types → pool → Bedarf/Wunsch/Zukunft/Übrig → groups (phone: without groups), dimension chain, parts list; Kapitalerträge a labelled source of their own, never folded, outside the household income; transfers, refunds and contact repayments left out. Owner/private acceptance remains |
| 1.5 | Jahresansicht | `reports-monat.js` | Connected: category × month heat grid for one year, Gruppen/Kategorien depth, chain, comparison with the same months of the previous year; Kapitalerträge as a separate memo row, never income; Erstattungen net against the refunded category. Owner acceptance open |
| 1.6 | Kategorieübersicht | `reports-monat.js` | Connected: categories of the Zeitraum with 12-month course, sum, average, change to the previous period, share of Konsum; open row with Ist/Plan chart (Plan = assigned amount), top payees. Owner acceptance open |
| 1.7 | Sparquote und Geldalter | `reports-monat.js` | Connected: Sparquote from household income only (no Kapitalerträge; Erstattungen net against their category), monthly and rolling 12 months against the R01 goal; Geldalter (FIFO, rule R03 definition) at every month end against the R03 goal; yearly table. Owner acceptance open |
| 1.8 | Gesamttabelle | `reports-monat.js` | Connected: all months from the budget start incl. the running month, month-end net worth, CSV of exactly the displayed rows and columns; account/depot CSV ZIP export is implemented separately. Owner acceptance open |
| 1.9 | Projekte und Nebeneinkünfte | `reports-monat.js` | Connected project management and closed-month P&L from attributed booking splits, signed refunds, monthly heat table and source links; Nebeneinkünfte remain a separate income type. Project hours/hourly rates and owner acceptance remain open |
| 2.1 | Ausgabenanalyse | `reports-ausgaben.js` | Connected: net Bedarf/Wunsch consumption per period from the shared budget read model, class bar, largest changes against the equally long previous window (absent for "Alles"), category bars with booking drilldown, 12-month heatmap. Spending is the monthly table read model (refunds netted against their category, owner decision); Zukunft shown apart, never consumption |
| 2.2 | Budgettreue inkl. 50/30/20 | `reports-ausgaben.js` | Connected: plan (assigned money; periodic categories with their reserve) against net spending per category and month (running month up to today), plan-minus-actual chain, 12-month 50/30/20 on the shared assigned-money allocation (twelfths per SPEC) with household income only (Kapitalerträge and Erstattungen excluded, owner decision 02.10.2026), rolling 12-month plan deviation. R01 on Heute and the rules use the same household-income base |
| 2.3 | Verträge und Abos | `reports-ausgaben.js` | Connected from expected outflow payments (same fixed/periodic selection and income base as R10, parity tested): bound amount per month with chain, monthly contract cost chart with price-change markers, grouped parts list with price history, price-increase hints, foreign currency with original amount, EUR today, EUR paid and average rate. Binding and notice periods are not in the ledger yet and are not shown or invented. A payment whose first due date and first price date are still ahead (next due date entered as start) counts as a contract from setup when that date is within one payment cycle; rule R10 values it the same way. 2.4 without an own basket says whether months or contract price history are missing and shows the stored VPI alone |
| 2.4 | Persönliche Inflation | `reports-ausgaben.js` | Connected: fixed-weight index (first-year weights) of the fixed-cost categories with stored price versions, 12-month change, index chart, contribution per category in percentage points, basket coverage. VPI comparison from Statistik Austria open data (CC BY 4.0): `OGD_vpi20_VPI_2020_1` (base 2020, to 12/2025) and `OGD_vpi25c18_VPI_2025COICOP18_1` (base 2025, from 1/2026), chained on the old base at the 2025 annual average (no separate factor is published; method documented in `packages/market/src/vpi.ts`). Stored in `consumer_price_index`, read by the nightly market run at most once a month; shown per month (12-month change, own against VPI) and per calendar year (annual averages, changes only between complete years). Variable categories are out of the basket (quantity and price cannot be separated) |
| 2.5 | Empfänger-Analyse | `reports-ausgaben.js` | Partial: connected signed recipient activity for Bedarf/Wunsch categories, period comparison and read-only booking drilldown; see [scope contract](payee-analysis-report.md) |
| 2.6 | Bank- und Zinskosten | `reports-ausgaben.js` | Connected from booked costs only: loan interest (non-transfer charges on loan accounts), bank fees (category group "Bank und Gebühren"), broker fees, bank foreign-currency fees; 12 months against the 12 before, calendar-year bars, interest and dividends apart as earnings (not household income), credit lines from the account terms, loan projection with and without the planned extra repayment (single loan), fund costs (TER) as a separate estimate from the portfolio summary, never in the sums |
| 3.1 | Liquiditätsprognose | `reports-zukunft.js` | Connected body: 90 days / 6 / 12 months, planned events stored in `planned_event` (add, switch off, remove, undo), 10 % buffer, 6-month verdict, month outlook, large movements, ledger-derived levers (pause Zukunft payments, cancel Wunsch contracts, trim variable). No surplus-to-Tagesgeld sweep (no stored rule); owner/private acceptance remains |
| 3.2 | Cashflow-Verlauf | `reports-zukunft.js` | Connected body: full months of the budget accounts per Zeitraum, household income minus Bedarf/Wunsch = net cashflow with Maßkette, Zukunft shown as part of it, Kapitalerträge as a separate labelled series (not income, not in the net cashflow; owner decision 02.10.2026), month table; transfers, refunds and contact repayments are never income. Owner/private acceptance remains |
| 3.3 | Vermögensverläufe | `reports-zukunft.js` | Connected body: same series and chain as Vermögen › Nettovermögen (API test asserts equality), assets stacked by account type with debts as dashed outline, structure table start/today/change/share. Structure read at start, week or month ends and today; owner/private acceptance remains |
| 3.4 | Jahresvorschau Zahlungen | `reports-zukunft.js` | Partial: connected twelve-month versioned expected-outflow contract preview, native ranges/currencies, stored status/link overlay; independent savings plans, other future transfers and full source dedup remain Open |
| 3.5 | Sparziele-Fortschritt | `reports-zukunft.js` | Partial: connected stored monthly goals, unique live EUR sources, API progress/rates/forecast and source drilldowns; emergency reach, Tagesgeld allocation, shared-source funding and linear Soll remain Open |
| 4.1 | Depots im Vergleich | `reports-portfolio.js` | Connected: one column per investment account and the total from the shared period performance (securities-only view), indexed depot lines against the largest position, KPIs side by side, products link to Portfolio; no depot cash, no external index |
| 4.2 | Allocation | `reports-portfolio.js` | Connected: class/product and region/product sunbursts (region weights stored per security; unassigned part shown), class table with depots and 12-month TTWROR, R13 Soll/Ist table and R15 note, Soll/Ist areas at month ends with the versioned Soll; no rebalancing actions |
| 4.3 | Einzahlungen und Wert | `reports-portfolio.js` | Partial: securities-only period chain, monthly value/flow series and conserved calendar-year rows; no depot cash or savings-plan/R12 attribution |
| 4.4 | Rendite und Kennzahlen | `reports-portfolio.js` | Connected securities-only metrics, lifetime documented realized gain, audited owner-selected benchmark with quote/FX gaps, historical class comparison and accessible monthly heatmap; depot-inclusive view and owner/private acceptance remain open. See `performance-report.md` |
| 4.5 | Kosten, Steuern, Erträge | `reports-portfolio.js` | Connected: 12-month chain gross income − broker tax on income − fees and TER = net, parts list, other broker taxes shown separately (as booked, no second withholding), illustrative latent KESt 27,5 % labelled as an example (upper bound, no loss netting), per-product table; unrecorded spreads are not included |
| 5.1 | Jahresreport | `reports-ueberblick.js` | Connected (`/api/overview/year`): two A4 sheets (print = exactly two pages, checked by PDF e2e) from the full months of a calendar year: net worth chain (start + own + market = end, same series as Vermögen), Einkommen/Konsum/Zukunft/Sparquote, Kapitalerträge apart, cashflow and net worth charts, month list, ten largest categories with change vs. the same months of the year before, 50/30/20 as the rules count them, stored Finanz-Check of the year's last month end (only the last twelve month ends are stored), category × month heat table, findings. Depot return is shown as the market move of the net worth chain, not as TTWROR; Gehaltserhöhungen and Preisänderungen are not findings yet |
| 5.2 | Finanz-Check-Verlauf | `reports-ueberblick.js` | Connected: stage with progress, current-stage and next-stage items, count chart and registered rules (`RULE_CODES`) status strips from the stored `rule_result` rows (12 month ends + today, `/api/rules/results`), open actions, since-date per rule. Opening the report re-derives the stored results (idempotent); a day without data stays "nicht bewertbar" |
| 5.3 | Explorer | `reports-ueberblick.js` | Connected (`/api/overview/explorer`): pivot over the live booking splits (rows Kategorie, Gruppe, Klasse, Empfänger, Einnahmenart; columns Monat, Quartal, Jahr, keine; Summe, Ø je Monat, Anzahl Buchungen; windows 1M to Alles), row heat, totals, category and recipient rows open their bookings. Saved views are kept per browser (`localStorage`), not on the server; the choices are page state, not in the URL |
| 5.4 | Kontakte-Abrechnung | `reports-ueberblick.js` | Fixed all-time EUR report: shared receivable/credit chain, per-person retained ledger, running balance stair chart and source drilldown. Pending bookings explicitly included; mixed currency unavailable. Owner/private acceptance remains |
| 5.5 | Zeitraumvergleich | `reports-ueberblick.js` | Connected (`/api/overview/compare`): four modes, month-by-month pairing inside the ledger, Konsum chain (vorher + mehr − weniger = jetzt), per-category bars around zero; Kapitalerträge shown apart from Einkommen and Sparquote. Mode is page state, not in the URL |

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

Book-derived rules and their configurable parameters: [English specification](concept/book-rules.md). Optional source inputs remain private database values.
