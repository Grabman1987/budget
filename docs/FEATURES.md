# Budget feature coverage: YNAB and Portfolio Performance replacement

Sidepanels-2a (2026-10-06): Vermögen instrument/schedule detail URLs, breadcrumbs/back/scroll restoration; existing FormDialog for metadata, quotes, schedules and trades, and full-width net-worth composition. Shared validation, audit/undo and cent logic retained; Linux visual CI and owner acceptance remain open. See [inventory](no-side-panels-1005.md).

E4 (2026-10-06): inbox confirmations learn category/income type, payee and account suggestions keyed by normalized counterparty plus direction; one-click **Übernehmen**, **wie zuletzt bei …**, settings removal and grouped audit/undo reuse `assignment_rule` without a migration. Suggestions never book automatically; synthetic API/browser coverage, owner acceptance pending.

UX-2b (owner 2026-10-05): shared free-envelope cover limits, pending/recurring commitments through payday, signed budget-account/used-credit details and explicit missing-money carry option; the total that can be covered is capped at budget-account balances plus allowed overdraft (view, single and bulk cover, server-side), a due matching an unlinked pending booking is reserved once, and commitments/cap apply only to the current month, always as of today; synthetic unit/API/browser coverage, CI and owner acceptance pending.

Owner directive PR4: [connected asset-class settings](asset-classes-settings.md), one target editor, complete dated managed universes, editable bands, investment-sum tiers, atomic safe retirement, restore and audit/undo/redo. Reuses merged PR1/PR2/PR3/PR5; real-iPhone, CI and owner acceptance remain separate from source implementation.

Owner directive PR3: central allocation quality/scope, provisional R13–R15/rebalancing, suppressed provisional savings changes, explicit investment cash and separate rebalancing/contribution amounts. Metadata APIs and synthetic regression coverage; PR4 settings, dynamic tiers and PR5 iPhone panels remain separate. See [allocation quality/scope](allocation-quality-scope.md).

Owner directive PR2 (2026-10-04): [shared risk policy and leverage](portfolio-risk-policy.md) connect stored R13/R14/R15 thresholds across Portfolio, rebalancing, report 4.2, savings recommendations and Heute/finance check. Leveraged ETFs use gross economic exposure in speculative/single-instrument limits; market allocation and regions remain unchanged. Stored class bands override the standard smaller of ±5 percentage points and ±25% of target. Historical risk-parameter/leverage versions, quality/scope, settings and iPhone infrastructure remain outside PR2.

Owner directive PR1 (2026-10-04): [historical weighted security exposures](asset-exposure.md) provide dated classification, exact-cent splits, server replacement API and grouped undo/redo across current allocation, R13/rebalancing, savings proposals, historical reports and exports. Settings UI and allocation-quality policy remain later PRs.

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

Owner chart feedback (2026-10-04): [shared chart inspection](chart-inspection.md) adds shared mouse/keyboard/touch value inspection across report,
wealth, Today and account charts, including every stacked layer and Sankey amounts/shares.
Report headers step through catalog order (Alt+Shift+Left/Right); presets and the period select
share one desktop row. Report valuation banners are removed; small approximation marks remain.
Negative bars use opaque red. Report 4.3 plots the existing daily valuations and cumulative
netflows while retaining monthly gain bars. No dependency or migration added; owner visual
acceptance and updated Linux screenshot baselines remain separate.

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
| Y13-P | Pace precision layer: Heute/One-Pager header, Ist / Erwartet / Deckel / Hochrechnung, shared tooltip and labelled today markers (including Plan › Monat variable bars) | UI + shared read model | Linear pro-rata expectation is computed once in the domain, separate from scheduled Plan bis heute; forecast reuses the existing pre-day-7 fixed-cost/plan logic and later extrapolation. Synthetic unit/API/component and desktop/mobile E2E evidence; Linux visual and owner acceptance remain open |
| Y13-C | Heute: three answer cards and nearest unfinished savings goal | UI + shared read models | Nettovermögen uses the Vermögen valuation and Gesamtübersicht 5.6 current-month delta/deposit/market figures; Dieser Monat uses the One-Pager household result; Budget retains the Leitmaß and current Pace spending/plan with a labelled time marker. Sparziele supplies saved/missing cents and nearest-date ordering. Cards stack on phones, retain exact cents, source links and amount privacy. [Synthetic evidence and affected baselines](evidence/heute-cards-1005/README.md); CI/Linux visual and owner acceptance remain open |
| Y01 | Account overview, budget/tracking/investment/debt roles, closed balances; sidebar card/loan debts in ink | UI + engine | Private balances; foreign-currency detail acceptance remains separate |
| Y02 | Account register: inline date/amount, status icons, visible flags; ranged balance chart with pending/recurring preview (0–365 days), limit and crosshair | UI + engine | Full native/EUR currency labelling across tables, charts and reconciliation |
| Y03 | Income/expenses: cash confirmed by default, booking-month income, no Budgetmonat; Wiederholen creates a schedule atomically | UI + engine | Owner phone/desktop usability acceptance with migrated data |
| Y04 | Split bookings, account transfers and bulk actions | UI + engine | Private reconciliation; trade/currency invariants have regression coverage |
| Y05 | Kontostand prüfen and confirmed bookings | UI + engine + bank observation | Bank balance/date/fetch stamp and reconciled-through date; matching current balances can lock through today with audit/undo. Real account acceptance remains open |
| Y06 | Categories/groups, Bedarf/Wunsch/Zukunft, targets and ordering | UI + engine | Owner-approved target categories and migration mapping |
| Y07 | Zu verteilen, Zugewiesen, Aktivität, Verfügbar and rollover | UI + engine | Gate 2: cent-exact account/month/category comparison with mapped source |
| Y08 | Credit-card payment categories and cash advances | Engine/API + budget integration | Real card mapping and payment-balance acceptance in Gate 2 |
| Y09 | Month planning: waterfall, time, groups, classes and triage | UI + engine | Owner acceptance; preserve nine-stage order and shared calculations |
| Y09a | Plan › Monat: faded target/median suggestions, Leere füllen, selected Wie letzter Monat / Ø 3 Monate / Ziel | UI + engine/API, synthetic regressions | Shared report spending and budget target/assignment cents; displayed-order partial funding and one undo/redo group. Owner/device and Linux visual acceptance remain open; [contract](plan-ghost-1005.md) |
| Y10 | Cover overspending with remaining-source label, largest sufficient suggestions and grouped partial bulk cover/undo; distribute money and preview next allocations | UI + engine | Real payday/month-end routine acceptance; later inspiration features are separate |
| Y11 | Wiederkehrende Zahlungen: weekly/monthly/quarterly/yearly, versions, due dates, contracts, matching, missed payments | UI + engine | Live incoming bank bookings and private schedule acceptance |
| Y12 | Savings goals and sinking funds, adopt category targets | UI + engine | Private targets and end-to-end goal review |
| Y13 | Heute: answer cards, daily allowance, next seven days, single attention block, shared net worth and Pace; further figures in remembered device fold | UI + engine | Daily allowance uses the exact existing lead divided by days through the shared next payday including today (one day on payday itself), cent-rounded then displayed as approximate whole euros; nonpositive lead shows alarm copy, formula on hover/focus, phone wraps. Shared period-bound R07/Heute window: 14 actual lookback days, next bank-day payday + 2 or shown month end + 2; short payday windows extend to following payday + 2. Five largest payment steps ≥250 EUR labeled, all daily steps in shared tooltip; remembered period, fallback Bis Gehalt. Synthetic unit/API/component and desktop/mobile coverage; Pace provisional through day 6, extrapolation from day 7; owner device acceptance open |
| Y14 | Plan › Jahr, planned events and scenario workflow | UI + engine; owner acceptance pending | Twelve envelope reads plus category/month event grid; audited create/edit/switch-off/remove and undo/redo; once/monthly/quarterly/yearly/specific-month rules shared with liquidity report 3.1. Unsaved selected-event scenarios overlay future event deltas on stored Zu verteilen, with monthly and December comparison. No bookings, assignments or extra income extrapolation; owner visual/device acceptance remains open |
| Y15 | Contacts, receivables, repayments and contact statements | EUR ledger/API + connected UI | Actual statement, retained balanced history, editable oldest-first allocation, explicit credit, atomic audit/undo and dependency guards implemented; foreign-currency statements, broader contact editing and owner workflow/design acceptance remain open. Derived balances do not enter net worth |
| Y16 | Posteingang: categorize, accept/reject suggestions, resolve exceptions | Queue/count, categorize/confirm, connected bank/assignment suggestions with explicit confirmation, bank merge/transfer decisions and acknowledgement with undo | Owner workflow acceptance remains open; warning acknowledgement does not repair the source |
| Y17 | Global search (Ctrl K) | UI + engine | Session-protected, bounded booking/payee/category/account/contact search; keyboard/touch navigation. Owner acceptance pending |
| Y18 | Assignment rules / Immer so zuordnen | UI + engine: all/any conditions, ordered suggestions, split/transfer actions, history preview, audit/undo and learn-from-booking | Source-specific payee cleanup and learned aliases; automatic preparation never posts a bank candidate without owner confirmation. Bounded regex dialect and transfer matching limits: [contract](assignment-rules.md). Owner/device acceptance remains open. Einstellungen › Zuordnungsregeln is one page: bank assignment rules plus the income budget-month defaults (decision 42) |
| Y19 | Bank connection, consent renewal and reconciliation | UI + engine + matching | Decision 41: BOOK immediately becomes an unchecked, uncategorized booking; PDNG stays a confirmation candidate. Per-source override, dedupe/audit and balance checks implemented. Owner-confirmed manual merge and mirror/selected-pair transfer linking (+/-5 days) for candidates and unchecked bank bookings, dated balance/reconciliation lock, audit/undo. Private bank acceptance remains |
| Y20 | Nightly bank/source worker with catch-up | Partial | Market timer exists; full worker and 14-day stable nightly acceptance do not |
| Y21 | Receipt photograph/upload and links to bookings | Implemented; owner acceptance open | Volume blobs, bounded authenticated upload, booking links/undo, inbox capture, previews/download and encrypted archive backup; metadata limits and real-phone/restore acceptance: [receipts](receipts.md) |
| Y22 | Payslip lines, projects and side income | Connected slice | Manual audited/undoable EUR payslip capture and linked payouts; project create/rename/archive, active booking attribution and split-based P&L. Raise metadata and hourly rates remain open; payslip receipt attachment uses the receipts store |
| Y23 | registered rules (`RULE_CODES`), stages and Finanz-Check | UI + engine | Book-derived checks, private inputs, configurable thresholds, disabled defaults; history derives twelve month ends plus today |
| Y24 | Weekly inbox, payday distribution, month/year/quarter closing routines | Partial | [F1 month close](month-close.md): persisted five-step navigation, live monthly inbox/reconciliation/overspending, reasoned exceptions and existing audited actions; F2 plan/closing steps, Job E palette/verdict integration and owner Gate 4 acceptance remain open |
| Y25 | Mobile capture, accessible layout, dark mode | UI + engine for built pages | Repeat matching mockup/visual/accessibility checks for every new page |
| Y26 | Installable PWA and offline booking queue | Implemented; device acceptance open | Static-only shell plus IndexedDB booking capture/edit/delete, FIFO retry on online/focus/manual send, durable API idempotency and retained conflict/session reasons. No API response caching; physical phone acceptance remains open. See [PWA contract](pwa.md) |

First private migration is EUR-only from 01.10.2023. Unsupported foreign-currency
budget accounts are guarded; full foreign-currency support remains later scope.

Owner feedback 2026-10-04 supersedes decision 42 in capture: no Budgetmonat field; new bookings use their booking month. Stored deferred values and explicit API overrides remain intact.

Historical decision 42: an inflow can carry **Für nächsten Monat**. Category
and income type stay intact; account balances and cash-flow/income reports keep the
actual date, while Zu verteilen and budget allocation use the following month.
Stored defaults remain available for imported assignment; they no longer defer new manual captures automatically. Transfers, contact repayments and mixed spending cannot
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
| R07 | Kontoprognose (section of 5.2) | Shared Heute balance read | Connected: same period preference, 14-day actual lookback, payday/month-end + 2 boundary, short payday extension, identical horizon/low to the cent, payment labels and daily tooltip. Background rule-status history retains its configured 35-day window; owner acceptance remains |
| 1.1 | Monats-One-Pager | `reports-monat.js` | Connected: month selector, drawing sheet A–G (result chain, 50/30/20 on assigned money, net worth with own/market, largest spending, plan, Finanz-Check cells, pace chart, revisions) from the shared ledger facts; Kapitalerträge only as a note (not in Einnahmen/Sparquote); no rate for a running month; valuation gaps shown honestly; A4 print stylesheet (one page, app chrome hidden, light tokens). Owner/private acceptance remains |
| 1.2 | Gehaltsreport | `reports-monat.js` | Connected manual capture, monthly gross/net and ratios, calendar years/same-month comparison, fourteen recorded salaries and linked-booking warnings. PDF storage, collective/step raises and inflation comparison remain open |
| 1.3 | Einnahmen | `reports-monat.js` | Connected: month selector, 12-month stacked income by type, expected against received (match status; schedule fallback `nicht zugeordnet` while occurrences are unmaterialised), Kapitalerträge separate (not household income), refunds/transfers/contact repayments excluded. Owner/private acceptance remains |
| 1.4 | Geldfluss | `reports-monat.js` | Connected: existing Sankey and parts list show amounts and shares of available money for Bedarf/Wunsch/Zukunft/Übrig and every group; shared tooltip includes shares. Household/capital/transfer classification unchanged. Owner visual/private acceptance remains. |
| 1.5 | Jahresansicht | `reports-monat.js` | Connected: category × month heat grid for one year, Gruppen/Kategorien depth, chain, comparison with the same months of the previous year; Kapitalerträge as a separate memo row, never income; Erstattungen net against the refunded category. Owner acceptance open |
| 1.6 | Kategorieübersicht | `reports-monat.js` | Connected: categories of the Zeitraum with 12-month course, sum, average, change to the previous period, share of Konsum; open row with Ist/Plan chart (Plan = assigned amount), top payees. Owner acceptance open |
| 1.7 | Sparquote und Geldalter | `reports-monat.js` | Connected: Sparquote from household income only (no Kapitalerträge; Erstattungen net against their category), monthly and rolling 12 months against the R01 goal; Geldalter (FIFO, rule R03 definition) at every month end against the R03 goal; yearly table. Owner acceptance open |
| 1.8 | Gesamttabelle | `reports-monat.js` | Connected: all months from the budget start incl. the running month, month-end net worth, CSV of exactly the displayed rows and columns; account/depot CSV ZIP export is implemented separately. Owner acceptance open |
| 1.9 | Projekte und Nebeneinkünfte | `reports-monat.js` | Connected project management and closed-month P&L from attributed booking splits, signed refunds, monthly heat table and source links; Nebeneinkünfte remain a separate income type. Project hours/hourly rates and owner acceptance remain open |
| 1.10 | Einnahmen und Ausgaben | Owner feedback 2026-10-04 | Connected: Income versus Expense monthly chart, expandable category-group table, household income subtotal with capital/refunds separately labelled, net, exact-cent booking drilldown and CSV of the displayed months/rows plus sum and mean. Own-account transfers and contact repayments excluded. Owner acceptance remains. |
| 1.11 | Budgettreue | Owner decision 2026-10-05 | Day-15 snapshots reuse Heute Pace per category and total; nightly idempotent capture on the first run after 02:30 Vienna on day 15 (later bookings that day are excluded; a month missed on day 15 gets no snapshot) and conservative backfill of the previous two months, closed-month forecast/actual EUR and % errors, inclusive 5% hit, six-calendar-month hit count/mean absolute error, signed bars, category booking links and reliability state. Heute adds the shared mean from three comparable months. See [contract and backfill limits](planning-accuracy.md); CI/owner acceptance remains open. |
| 2.1 | Ausgabenanalyse | `reports-ausgaben.js` | Connected: net Bedarf/Wunsch consumption per period from the shared budget read model, class bar, largest changes against the equally long previous window (absent for "Alles"), category bars with booking drilldown, 12-month heatmap. Spending is the monthly table read model (refunds netted against their category, owner decision); Zukunft shown apart, never consumption |
| 2.2 | Budgettreue inkl. 50/30/20 | `reports-ausgaben.js` | Connected: plan (assigned money; periodic categories with their reserve) against net spending per category and month (running month up to today), plan-minus-actual chain, 12-month 50/30/20 on the shared assigned-money allocation (twelfths per SPEC) with household income only (Kapitalerträge and Erstattungen excluded, owner decision 02.10.2026), rolling 12-month plan deviation. R01 on Heute and the rules use the same household-income base |
| 2.3 | Verträge und Abos | `reports-ausgaben.js` | Connected: no term column; payments with any end date excluded from binding and list. Current stored terms price the headline; linked occurrences or same-payee/category splits derive sustained historical prices, chart and price-check hints, marked as derived. One-off payments remain in liquidity/year preview. Notice periods are absent from the data model. |
| 2.4 | Persönliche Inflation | `reports-ausgaben.js` | Connected: contract-relative chained Laspeyres with December annual weighting, successors, trailing means and exact contributions. Separate Warenkorb vs. VPI and category explorer with multi-select (basket defaults), own/category-reference index histories from October 2023, editable COICOP splits independent of basket method, explicit total-VPI fallback, neutral percentage-point differences and supported booking-count/unit attribution. Variable booking averages disclose purchase mix; fixed owner-interpretation note replaces automatic verdicts. Existing CPI loader and per-contract chain reused; owner mapping/design acceptance remains. |
| 2.5 | Empfänger-Analyse | `reports-ausgaben.js` | Connected for the documented Bedarf/Wunsch consumption scope: recipient totals/comparison, frequency and average booking amount, monthly chart and exact split drilldown. [Scope and exclusions](payee-analysis-report.md). Broader all-account cash outflows and uncategorized expenses are deliberately outside this report; owner acceptance remains. |
| 2.6 | Bank- und Zinskosten | `reports-ausgaben.js` | Connected: monthly stacked costs by loan interest, bank/card/account fees, trade fees, FX fees and overdraft; separate interest/dividend earnings, twelve-month cost/month average/comparison/largest source, annual totals and source sums. Stored loan terms supply marked estimates where no separate interest booking exists; explicit monthly interest wins, principal excluded. Unstored spreads/TER and missing historical FX cannot be inferred. |
| 3.1 | Liquiditätsprognose | `reports-zukunft.js` | Connected body: 90 days / 6 / 12 months, planned events stored in `planned_event` (add, switch off, remove, undo), 10 % buffer, 6-month verdict, month outlook, large movements, ledger-derived levers (pause Zukunft payments, cancel Wunsch contracts, trim variable). No surplus-to-Tagesgeld sweep (no stored rule); owner/private acceptance remains |
| 3.2 | Cashflow-Verlauf | `reports-zukunft.js` | Connected body: full months of the budget accounts per Zeitraum, household income minus Bedarf/Wunsch = net cashflow with Maßkette, Zukunft shown as part of it, Kapitalerträge as a separate labelled series (not income, not in the net cashflow; owner decision 02.10.2026), month table; transfers, refunds and contact repayments are never income. Owner/private acceptance remains |
| 3.3 | Vermögensverläufe | `reports-zukunft.js` | Connected body: same series and chain as Vermögen › Nettovermögen (API test asserts equality), assets stacked by account type with debts as dashed outline, structure table start/today/change/share. Structure read at start, week or month ends and today; owner/private acceptance remains |
| 3.4 | Jahresvorschau Zahlungen | `reports-zukunft.js` | Connected: expected outflows plus independent savings-plan executions and stored future own-account transfers; exact source/destination/date/currency/amount dedup consumes at most one schedule, stored occurrence identities avoid duplicates. Monthly rows consolidated. Unlinked expected payments cannot be safely identified as an independent savings execution; missing identities remain separate rather than guessed. |
| 3.5 | Sparziele-Fortschritt | `reports-zukunft.js` | Connected available data: stored goal progress, reserve reach in months of closed Bedarf, explicit EUR Tagesgeld account-to-goal allocation and linear target history from goal creation. Shared-account/category funding allocations and category-to-bank allocation remain unavailable because no allocation source exists; foreign reserves remain explicitly incomplete. |
| 3.6 | Vermögen & Schulden | own (YNAB net-worth report in the Blaupause design) | Connected: assets and debts per month end (ink bars above, pale bars below zero) with the net worth as line; header Nettovermögen, Vermögenswerte, Schulden and Veränderung im Zeitraum in EUR and %. Same `netWorthAsOf` valuation as Vermögen › Nettovermögen (API test asserts equal end and start values); an account is an asset while positive and a debt while negative (loans, cards in the red, overdrawn cash). Zeitraum like the other reports (default Alles, 12 months, year, custom range, `?zeitraum=`); `?monat=` selects a month and lists its accounts; months with estimated prices carry the valuation hint (`≈`). Month table as accessible fallback; no panels, so phone-safe. Owner acceptance remains |
| 4.1 | Depots im Vergleich | `reports-portfolio.js` | All investment account types, including P2P/manual values and external flows; closed zero-value/zero-flow depots hidden for the period; cards without product lists; persisted multi-index benchmarks with dashed lines and returns |
| 4.2 | Allocation | `reports-portfolio.js` | Class/product and region/product sunbursts and month-end layers use positive classified market value (100%); cash/negative/unclassified positions separately; budget-start history, distinct palette colours, dated Soll bands and shared class tooltip; signed R13 risk basis preserved |
| 4.3 | Einzahlungen und Wert | `reports-portfolio.js` | Daily securities values and cumulative net flows, signed monthly gain bars, shared tooltip and month reconciliation (start, inflow, outflow, gain, end); conserved calendar-year rows; no depot-cash or savings-plan/R12 attribution |
| 4.4 | Rendite und Kennzahlen | `reports-portfolio.js` | Securities-only metrics, realized gain, four persisted benchmark checkboxes, EUR index-ETF price returns/gaps, historical class comparisons and accessible monthly heatmap. See `portfolio-reports-1004.md`; owner/private acceptance open |
| 4.5 | Kosten, Steuern, Erträge | `reports-portfolio.js` | Connected: 12-month chain gross income − broker tax on income − fees and TER = net, parts list, other broker taxes shown separately (as booked, no second withholding), illustrative latent KESt 27,5 % labelled as an example (upper bound, no loss netting), per-product table; unrecorded spreads are not included |
| 5.1 | Jahresreport | `reports-ueberblick.js` | Connected (`/api/overview/year`): two A4 sheets (print = exactly two pages, checked by PDF e2e) from the full months of a calendar year: net worth chain (start + own + market = end, same series as Vermögen), Einkommen/Konsum/Zukunft/Sparquote, Kapitalerträge apart, cashflow and net worth charts, month list, ten largest categories with change vs. the same months of the year before, 50/30/20 as the rules count them, stored Finanz-Check of the year's last month end (only the last twelve month ends are stored), category × month heat table, findings. Depot return is shown as the market move of the net worth chain, not as TTWROR; Gehaltserhöhungen and Preisänderungen are not findings yet |
| 5.2 | Finanz-Check-Verlauf | `reports-ueberblick.js` | Connected: stage with progress, current-stage and next-stage items, count chart and registered rules (`RULE_CODES`) status strips from the stored `rule_result` rows (12 month ends + today, `/api/rules/results`), open actions, since-date per rule. Opening the report re-derives the stored results (idempotent); a day without data stays "nicht bewertbar" |
| 5.3 | Explorer | `reports-ueberblick.js` | Connected (`/api/overview/explorer`): pivot over the live booking splits (rows Kategorie, Gruppe, Klasse, Empfänger, Einnahmenart; columns Monat, Quartal, Jahr, keine; Summe, Ø je Monat, Anzahl Buchungen; windows 1M to Alles), row heat, totals, category and recipient rows open their bookings. Saved views are kept per browser (`localStorage`), not on the server; the choices are page state, not in the URL |
| 5.4 | Kontakte-Abrechnung | `reports-ueberblick.js` | Fixed all-time EUR report: shared receivable/credit chain, per-person retained ledger, running balance stair chart and source drilldown. Pending bookings explicitly included; mixed currency unavailable. Owner/private acceptance remains |
| 5.5 | Zeitraumvergleich | `reports-ueberblick.js` | Connected (`/api/overview/compare`): four modes, month-by-month pairing inside the ledger, Konsum chain (vorher + mehr − weniger = jetzt), per-category bars around zero; Kapitalerträge shown apart from Einkommen and Sparquote. Mode is page state, not in the URL |
| 5.6 | Gesamtübersicht | owner feedback 2026-10-04 | Monthly whole picture, first in Überblick: existing cashflow and net-worth valuations, investment boundary flows and shared depot performance; cent-exact start + savings + market + other = end, separate capital income, signed monthly bars/net-worth band, source links and displayed-table CSV. Synthetic equality/valuation tests and desktop/mobile browser checks; owner acceptance open |

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
| Sources and asset-class management settings | Partial / placeholders | Complete editors and connected operational status |
| Assignment rule settings and bank payee cleanup | Connected editor, history preview, ordering, enable/disable, source cleanup and audit/undo | Owner workflow/device acceptance; see [contract](assignment-rules.md) |
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
